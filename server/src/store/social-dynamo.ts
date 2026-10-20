import { type DynamoDBDocumentClient, BatchWriteCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { BOARD_TTL_MS, MAX_MAYORS, PRESENCE_MS, type SocialStore, whoOf } from '../social.js';

/**
 * Live city and leaderboards in the player table (no new table, no new IAM: the same actions on the same table).
 *   PRESENCE#<region>    <who>                 until, name?, rank?    (90 s; Query + filter on `until`)
 *   LB#<board>#<week>    <who>                 name, score            (9 weeks)
 *   USER#<sub>           SOCIAL#<pk>           ref → the row above    (so forget() and DELETE /me find every row)
 * `who` is a salted hash of the sub. A board is read whole (a learner game's weekly board stays small); at most 4 pages.
 */
export function dynamoSocial(db: DynamoDBDocumentClient, TableName: string, now: () => number = Date.now): SocialStore {
  const ttl = (ms: number) => Math.floor((now() + ms) / 1000);
  const user = (sub: string) => `USER#${sub}`;
  const ref = (sub: string, pk: string, ms: number) => db.send(new PutCommand({ TableName, Item: { pk: user(sub), sk: `SOCIAL#${pk}`, target: pk, ttl: ttl(ms) } }));
  const queryAll = async (pk: string, pages = 4, prefix?: string) => {
    const items: Record<string, unknown>[] = [];
    let start: Record<string, unknown> | undefined;
    for (let i = 0; i < pages; i++) {
      const out = await db.send(
        new QueryCommand({
          TableName,
          KeyConditionExpression: prefix ? 'pk = :pk AND begins_with(sk, :p)' : 'pk = :pk',
          ExpressionAttributeValues: prefix ? { ':pk': pk, ':p': prefix } : { ':pk': pk },
          ExclusiveStartKey: start,
        }),
      );
      items.push(...((out.Items ?? []) as Record<string, unknown>[]));
      start = out.LastEvaluatedKey;
      if (!start) break;
    }
    return items;
  };
  const batchDelete = async (keys: { pk: string; sk: string }[]) => {
    for (let i = 0; i < keys.length; i += 25) {
      let pending = keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } }));
      for (let attempt = 0; pending.length; attempt++) {
        if (attempt === 6) throw new Error('Could not delete every social row (throttled); try again');
        if (attempt) await new Promise((r) => setTimeout(r, 2 ** attempt * 50 + Math.random() * 50));
        const res = await db.send(new BatchWriteCommand({ RequestItems: { [TableName]: pending } }));
        pending = (res.UnprocessedItems?.[TableName] ?? []) as typeof pending;
      }
    }
  };
  const store: SocialStore = {
    async beat(region, sub, mayor) {
      const pk = `PRESENCE#${region}`;
      await db.send(new PutCommand({ TableName, Item: { pk, sk: whoOf(sub), until: now() + PRESENCE_MS, ...(mayor ?? {}), ttl: ttl(PRESENCE_MS + 60_000) } }));
      await ref(sub, pk, PRESENCE_MS + 60_000);
    },
    async presence(region) {
      const live = (await queryAll(`PRESENCE#${region}`, 2)).filter((i) => typeof i.until === 'number' && i.until > now());
      const mayors = live.flatMap((i) => (typeof i.name === 'string' && typeof i.rank === 'string' ? [{ name: i.name, rank: i.rank }] : [])).slice(0, MAX_MAYORS);
      return { online: live.length, mayors };
    },
    async submit(board, week, sub, name, score) {
      const pk = `LB#${board}#${week}`;
      // Keeps the best: the write only lands when it beats what's there (or nothing is).
      await db
        .send(
          new UpdateCommand({
            TableName,
            Key: { pk, sk: whoOf(sub) },
            UpdateExpression: 'SET #n = :n, score = :s, #t = :t',
            ConditionExpression: 'attribute_not_exists(score) OR score < :s',
            ExpressionAttributeNames: { '#n': 'name', '#t': 'ttl' },
            ExpressionAttributeValues: { ':n': name, ':s': score, ':t': ttl(BOARD_TTL_MS) },
          }),
        )
        .catch((err: { name?: string }) => {
          if (err?.name !== 'ConditionalCheckFailedException') throw err;
        });
      await ref(sub, pk, BOARD_TTL_MS);
    },
    async top(board, week, sub, limit) {
      const who = whoOf(sub);
      return (await queryAll(`LB#${board}#${week}`))
        .flatMap((i) => (typeof i.name === 'string' && typeof i.score === 'number' ? [{ name: i.name, score: i.score, sk: i.sk }] : []))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((e) => ({ name: e.name, score: e.score, ...(e.sk === who ? { you: true } : {}) }));
    },
    async forget(sub) {
      const who = whoOf(sub);
      const refs = await queryAll(user(sub), 20, 'SOCIAL#');
      await batchDelete([...refs.map((r) => ({ pk: r.target as string, sk: who })), ...refs.map((r) => ({ pk: user(sub), sk: r.sk as string }))]);
    },
  };
  return store;
}
