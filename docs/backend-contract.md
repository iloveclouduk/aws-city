# Backend contract v2.16

**Source of truth:** `src/backend/contract.ts`. If this doc and that file disagree, the file wins,
so fix this doc. Both backends import or mirror that file:
- `server/src/world.ts` re-exports it, so a contract change breaks the server build.
- The parked AgentCore backend has a Python mirror.

`npm test` checks the mock against the contract, and `cd server && npm test` checks the server.

## Backends

| `WXT_BACKEND` | Backend | Transport | Deploys |
|---|---|---|---|
| `mock` (default) | `src/backend/MockBackend.ts`, runs in the browser | none | Simulated curated templates |
| `aws` | **`server/`**, the team's local Node server with a real account and Claude on Bedrock | WebSocket `/ws` + REST `/progress`, `/screenshots`; the Origin allowlist is `EXTENSION_ORIGIN` | **Guarded actions** (EC2 t4g, DynamoDB, S3); every write needs the player's approval |
| `hosted` | **`server/`** deployed by `infra/` (ECS Fargate): players sign in with Cognito (JWT in `Sec-WebSocket-Protocol`, `Authorization: Bearer` on REST) and link their own AWS account | Same as `aws` | Guarded actions in the **player's own account** through `AWSCityPlayerRole-<region>` (ExternalId), each needing approval |

The workshop account denies CloudFormation and `iam:CreateRole`, so `aws` is the backend in use.

## Client → server

| Command | Fields | Notes |
|---|---|---|
| `task.submit` | `taskId, prompt, context{url,title,serviceId,screenshotKey}, questId?` | The server rejects unknown fields; the adapter strips `questId`. |
| `chat.ask` | `requestId, districtId, question, context` | |
| `page.classify` | `requestId, context` (with `screenshotKey` or url/title) | |
| `deploy.approve` / `deploy.reject` | `deployId, confirm?` | The player's answer to a `deploy.preview`. Nothing changes in AWS without `deploy.approve`. |
| `deploy.plan` | `requestId, templateId` | On `aws`, `ServerBackend` sends it to the matching agent as a prompt (`GUARDED_BLUEPRINTS`). |
| `deploy.teardown` | `deployId` | On `aws`, it asks the agent to demolish what was built (that also needs approval). |
| `account.link` | `requestId, region` | Hosted: returns `account.linkUrl` (CloudFormation quick-create for `infra/player-role/player-role.yaml`, with the player's ExternalId). |
| `account.verify` | `requestId, roleArn` | `roleArn` may be just the 12-digit account id. The server assumes the role and checks the caller identity before linking. |
| `bill.enable` | `on` | v2.5: the month-to-date bill on or off (off by default; each Cost Explorer read costs $0.01, so at most one a day). |
| `flow.enable` | `on` | v2.8: live traffic on or off (off by default; CloudWatch reads at most every 5 minutes while the city is open). |
| `workshop.verify` | `workshopId, stepId, values?` | v2.10: check a workshop step in the account, read-only (see below). |
| `presence.beat` | `region, rank?` | v2.11: the player is in this city now (on connect, on arriving, every 30 s while a tab is visible). |
| `score.submit` | `board, score` | v2.11: a best for a weekly leaderboard (a game id or `mayors:<region>`). |
| `leaderboard.get` | `board` | v2.11: this week's top of a board. |
| `progress.get/put`, `screenshot.presign`, `quest.start` | | On `aws`/`hosted`, handled over REST (`/progress`, `/screenshots`) or locally by `ServerBackend`. `DELETE /me` removes everything stored for the player. |

Client-internal, not on the wire: `storage.local` keeps `progress.parked` (a signed-out player's unsynced progress, tagged with the player's id, their Cognito `sub`, and only ever restored to that same player), and the optional `AgentBackend.playerId()` (hosted only; absent on local/mock) exists just to tag it. It is not a security check: the server authorizes every request by the JWT.

## Server → client

| Event | What the city does |
|---|---|
| `task.plan {taskId, agentId, targetServiceId, steps[]}` | The Concierge dispatches the agent, which walks to its landmark. |
| `task.step {taskId, index, text, status}` | A bubble shows "Step i/n" and the feed updates. `skipped` means the agent remembers you know this step. |
| `agent.state {agentId, state, service?, detail?}` | **`working` means a real AWS call is running.** The agent plays its work animation. |
| `agent.message {from, to, text}` | A speech bubble appears and a data packet travels the roads between the two agents. |
| `task.done {taskId, ok, result, xp[]}` | XP goes to landmarks: tiers go up, the city grows, and quests advance. |
| `deploy.preview {deployId, taskId?, templateId, stackName, region, changes[], costNote?}` | The Deploy tab shows the change list with **Approve / Reject**. |
| `deploy.status {deployId, status, message?, outputs?}` | `status` is one of `creating`, `complete`, `failed`, `rejected`, `deleting` or `deleted`. |
| `agent.level {agentId, level, skill?}` | The agent gets faster and announces its new skill. |
| `account.status`, `account.linkUrl` | These drive the Deploy tab's account section. |
| `presence.state {region, online, mayors[{name, rank}], practice?}` | v2.11: the HUD's 👥 count; public mayors walk the streets as visitors. |
| `leaderboard.state {board, week, entries[{name, score, you?}], practice?}` | v2.11: the leaderboard card. |
| `workshop.verified {workshopId, stepId, ok, detail}` | v2.10: the step is ticked as done for real (and pays its building), or the sentence says what to try. |
| `page.classified`, `chat.answer` (streamed), `screenshot.url`, `progress.state`, `error` | The same as in v1. |

**v2.2 additions (all optional):**
- `error.code`: `quota` (the player's daily AI calls are used up), `paused` (the city's AI is switched off), `auth` (sign in again), `unlinked` (connect an AWS account first) or `mfa_required` (hosted: `account.link`/`account.verify`, `deploy.approve` and `finding.fix` need an authenticator app on first; the Deploy tab enrols one). The UI shows friendly text for each.
- `sources: [{title, url}]` on `task.done` and on the final `chat.answer`: the AWS documentation pages (docs.aws.amazon.com / aws.amazon.com only) the answer was grounded in, from the AWS Knowledge MCP server.
- WebSocket close codes (`CLOSE_CODES` in `contract.ts`): `4401` = reconnect with a fresh token, `4403` = the account was deleted
  (`DELETE /me`, from this tab or another): sign out and don't reconnect, `1012` = server restarting (reconnect with jitter),
  `4429` = too many tabs. Hosted, a deleted player is refused for two hours (longer than an access token lives): the WebSocket
  upgrade, `GET`/`PUT /progress` and `POST /screenshots` answer `410`, so a still-valid token can't recreate their data.

**v2.3 additions, city care (all additive):** citizens look after a city that mirrors the account.
- `city.inventory {takenAt, region, source, complete, counts, items[], truncated}`: what's in the account. `source` is
  `resource-explorer` (complete), `tagging` or `collectors` (both may miss resources, so `complete: false`) or `mock`. Items
  carry `arn, type, name, serviceId|null, districtId|null, managedByGame`; at most ~300 per frame.
- `city.inventory` also carries `homeRegion`, `regions {code: count}` and `links[]` (`{id, serviceId, from{region,az?},
  to{region,az?}, kind: replication|standby|traffic, twoWay?, label}`); items carry `region?` and `az?`. With a Resource
  Explorer aggregator index in the home Region the list spans every Region; otherwise only the home Region.
  Each link drives through the city of either Region it touches as a data carrier (replication → tanker, standby →
  standby van, traffic → request car), tappable to see what it carries and its list price per GB.
- `city.finding {finding}`: a Well-Architected finding opened or resolved, `{id, ruleId, serviceId, districtId, citizenId,
  pillar, severity, status, resource{id,name,arn?,gameOwned}, title, text, url, fix?, undoUntil?}`. Rules are code
  (`server/src/agents/wellarchitected.ts`) and their text is data (`shared/wa-rules.json`). All open findings are sent on connect.
- `finding.explain {requestId, findingId}`: the finding's citizen explains it, as an `agent.message` to `user`.
- `finding.undo {requestId, findingId}`: answered with how to undo the fix in the AWS console (fixes only tighten things).
- `finding.fix {requestId, findingId}`: nothing changes yet. The server
  re-reads the resource, then sends a `deploy.preview` with `findingId`, `rollback`, `costNote?` and, for a resource the
  city didn't build or an account-wide setting, `confirmText` (the resource id or ARN, which is unique). Approve with `deploy.approve {deployId, confirm}`; the
  server compares `confirm` to `confirmText`. Fixes are a fixed allowlist of reversible changes (`server/src/agents/fixes.ts`).
- `Progress.citizens` (`{id: {xp}}`) and `Progress.fixes` (`{findingId: iso}`).
- v2.4: `Progress.streak` (`{days, last: 'YYYY-MM-DD' local date, best}`), merged by the later `last` with `best` = max.

**v2.5 additions, the real map and the bill (all optional):**
- `city.inventory.zones {region: [{name, id}]}`: the account's Availability Zones (zone type `availability-zone`, sorted
  by name) for the home Region and every Region with resources, from `ec2:DescribeAvailabilityZones` (cached a day). AZ
  names are mapped per account (`us-west-2a` here can be `usw2-az2`); the AZ ID is the same in every account. A Region
  the server can't read is left out.
- `city.inventory.regionStatus {region: 'enabled'|'not-enabled'}`: from `ec2:DescribeRegions {AllRegions: true}`
  (`opt-in-not-required`/`opted-in` = enabled, `not-opted-in` = not-enabled).
- `bill.enable {on}`: turns the city's bill on or off (also kept as `Progress.bill`). Off by default: Cost Explorer
  charges $0.01 per request, so the server calls `ce:GetCostAndUsage` only while it's on, when it's turned on and then at
  most once a day per player (cached in the player's store).
- `city.bill {month: 'YYYY-MM', currency, total, byService {serviceId|'other': n}, byRegion {region|'global': n}, takenAt,
  estimated: true}`: month-to-date UnblendedCost (as Cost Explorer reports it, credits and refunds included), rounded to
  cents. Cost Explorer's service names map to landmarks through `shared/ce-services.json`; anything else is `other`. Sent
  on connect while the bill is on, and after each read. If it can't be read: `city.bill {unavailable, takenAt}`, one plain
  sentence (no permission, Cost Explorer still turning on…). Narrow on `unavailable`.

**v2.6 additions, AWS's public status (all optional, the same for every player):**
- `aws.health {asOf, incidents[], stale?}`: the public AWS Health Dashboard (`health.aws.amazon.com/public/currentevents`,
  with `status.aws.amazon.com/rss/all.rss` as the fallback). No account, credentials or IAM are involved, and no player
  data is sent. The server reads it once for everyone (`server/src/news/`): every 3 minutes, waiting 15 minutes after a
  failure, with a 5 s timeout, a 4 MB cap and no redirects, from allow-listed hosts only. Each incident is
  `{id, region|'global', regionName?, azIds?, severity: informational|degradation|disruption, status: open|resolved,
  title, services[], serviceCount, serviceIds[], started, updated, log[{at, text}]}`. AWS's text is untrusted data: tags
  and control characters are removed, it's trimmed, and it's never given to a model. `serviceIds` map through
  `shared/aws-health-services.json` (verified codes only), and `azIds` keep only the Region's own zone IDs. An incident
  that leaves the dashboard becomes `resolved` and stays for a day. `stale: true` means the dashboard couldn't be read and
  these are the last known incidents. Sent on connect and when the incidents change; the frame stays under 64 KB.
  `drill: true` exists only in the demo (a practice event the game made up).
- `aws.news {asOf, items[{id, title, url, date, serviceIds[]}]}`: the latest AWS What's New announcements, read hourly.
  `url` is always an `https://aws.amazon.com/` page.
- The city shows these as a ticker over the map and an incident card. An affected Region pulses on the world map. In
  its city, the affected landmarks are fenced and dark, a Region-wide event brings rain, and the islands of the AZs
  named in the updates are marked. This is one of two exceptions to "ambience never means AWS activity": it's AWS's own
  status, not the player's account. (The other: each of the account's `links[]` drives through its city as a data
  carrier, see `city.inventory`.)

**v2.7 addition, each Region is its own city (optional, client-side only):**
- `Progress.cities?: {[regionCode]: {landmarks: {[serviceId]: {discovered, xp}}}}`. Like real AWS, what's built in one
  Region isn't in another, and a new Region's city starts empty. Global services (`shared/region-facts.json` `global`:
  IAM, Route 53, CloudFront) stay in `Progress.landmarks` and stand in every city. Cards, quests, puzzles, games, citizens
  and the streak are the player's own and follow them everywhere. A save from before v2.7 keeps every landmark in
  `landmarks`; the client moves its Region landmarks into the city the player was building (`migrateCities` in
  `src/state/cities.ts`). The server stores the field as-is (`server/src/contract/progress.ts` validates the Region code
  and caps the count), and copies merge city by city.

### The one rule that makes it feel alive

Send `agent.state working` right before every real AWS call made for an agent, and `idle` right after.
Both backends follow it. The server never sends it for background polling.

### Approvals on `aws` (server)

1. An agent's write tool call is parsed, then checked by policy: it must be a game-owned resource and within the limits.
2. `approvals.request` sends a `deploy.preview` (`server/src/contract/approvals.ts`).
3. The player sends `deploy.approve`. The server sends `deploy.status creating`, re-checks policy inside the write lock, executes, then sends `deploy.status complete` or `failed`.
4. Requests with no answer expire after 5 minutes, and closing the socket rejects all pending requests. With no approval channel, every write is refused and only reads run (`server/src/agents/service.ts`; proof: `server/test/service.test.ts`).

## Console Copilot (v2.1)

Agents act in the player's live, logged-in AWS console, one visible step at a time, and teach the *why* for each step.

**Flow:**
1. **The content script** (`src/entrypoints/console.content.ts`) sends a snapshot of the page's interactive elements. It includes id, role, accessible name, section and state. It sends labels only; it never reads secret fields.
2. The runtime sends `console.start {taskId, goal, context, snapshot}`.
3. The backend answers with `console.step {taskId, index, agentId, action, target{id,name}, value?, say, why, risk}`. The `action` is one of `click`, `type`, `select`, `point` or `done`.
4. The page shows the step: an orange highlight plus the agent's bubble with what and why. It then performs the step and replies with `console.observe {taskId, index, ok, note?, snapshot}`.
5. Steps repeat until `done`. The game shows each step in the agent's bubble and the feed.
6. `console.stop {taskId}` stops the task. The player can also stop it from the Stop chip on the page, the Stop button in the city, or Esc.

**Safety** (`src/console/safety.ts`, which runs in the page no matter what the backend says):
- Risky controls are never clicked by the agent. The page turns them into a green "your turn" highlight that waits for the player's click. The server also sets `risk:'confirm'` on them.
  - Risky means: delete, terminate, remove, empty, public access, IAM admin or access keys, billing, account settings, sign-out.
- Nothing is typed into secret fields.
- It runs only on `https://*.console.aws.amazon.com`, never on sign-in pages, and only during a Copilot task the player started.
- There's a limit of 25 steps, and it stops after 3 failures.

**Backends:**
- The mock (`src/backend/consoleMock.ts`) has scripted walkthroughs driven by the live snapshot: S3 create bucket, EC2 launch instance, DynamoDB create table and Lambda create function (`npm run smoke:copilot` runs all four against fixtures).
- The server (`server/src/contract/console.ts`) uses Claude on Bedrock with the `next_console_step` tool, validated with zod, so it works on any console page.

**v2.8 additions, live traffic (optional):**

- `flow.enable {on}`: turns live traffic on or off (also kept as `Progress.flow`; the client sends it on every connect
  once it has pulled the account's progress). Off by default.
- `city.flow {region, windowMin, rates: [{id, serviceId, kind: requests|invocations|writes, perMin, byAz?, label}], takenAt}`:
  the account's request counts over the last `windowMin` (15) minutes, per minute, from CloudWatch Metrics Insights:
  load balancer `RequestCount` by Availability Zone, Lambda `Invocations`, API Gateway `Count` and DynamoDB
  `ConsumedWriteCapacityUnits` (`server/src/state/flow.ts` `FLOW_QUERIES`, fixed text; one query per `GetMetricData`
  call, which is all the API takes). Read only while it's on and a tab is open, at most every 5 minutes and 96 times a
  day; CloudWatch charges per metric analyzed (about a cent a day for a learner). If it can't be read:
  `city.flow {unavailable, takenAt}`, one plain sentence (a denied read asks for the updated player role, v4).
- The city drives request cars for these rates (`carsPerMinute`, log-scaled, at most 6 a minute per source, inside
  the data-carrier cap): from the highway to the AZ islands that served the load balancer's requests, and to each
  other service's building.

**v2.9 additions, golden tokens (optional):**

- `Progress.finds?: {[tokenId]: 'YYYY-MM-DD'}`: the golden tokens the player found walking round their cities
  (`src/world/tokens.ts`, six per city, ids `<regionCode>:<n>`), with the local date each was found. Merged as a union;
  the earlier date wins. The server stores it like the rest of `Progress` (at most 1,000 entries).

**v2.10 additions, hands-on workshops and AWS North Hall (optional):**

- `workshop.verify {workshopId, stepId, values?}`: check one workshop step (`shared/workshops.json`) in the player's
  account. The server takes a fresh poll of the account (the same read-only calls the player role already grants) and
  runs the step's one check from a fixed registry (`server/src/workshops/checks.ts`: a table, bucket, function or
  instance is there, in a state, or gone). `values` are the step's placeholder values (`<table>` → `orders`), at most 8,
  each checked against the check's own name pattern. No writes, no commands. Counts as a request on the socket.
- `workshop.verified {workshopId, stepId, ok, detail}`: the answer, with one plain sentence (`detail`). With no linked
  account, `ok: false` and a sentence asking to connect one.
- `Progress.workshops?: {[workshopId]: {steps: {[stepId]: 'practice' | 'real'}, done?: 'YYYY-MM-DD'}}`: each step done
  in the practice terminal or checked for real, and the local date the workshop was finished. Merged step by step
  (`real` beats `practice`); the earlier finish date wins. At most 200 workshops of 50 steps.
- `Progress.talks?: {[talkId]: 'YYYY-MM-DD'}`: AWS North Hall talks whose check was passed (`shared/conference.json`).
  Merged like `finds`.
- `CONTRACT_VERSION` is a string from v2.10 (`'2.10'`): the number 2.10 is 2.1.

**v2.11 additions, the Mayor's city, the live city and leaderboards (optional):**

- `Progress.profile?: {public, name}`: off by default. `name` is two words from the game's lists (`src/state/names.ts`,
  `^[A-Z][a-z]+ [A-Z][a-z]+$`), never typed by a player. The newer copy's choice wins on merge. Turning it off (a
  `PUT /progress` with `public: false` after `true`) removes the player's presence and every leaderboard row.
- `Progress.badges?: {[badgeId]: 'YYYY-MM-DD'}`: badges earned at a moment the rest of `Progress` doesn't record (most
  badges are read from `Progress` itself, `src/state/badges.ts`). Union; the earlier date wins.
- `Progress.designs?: {[designId]: {name, updatedAt, nodes[], edges[]}}`: architecture sandbox designs (at most 20, 60
  nodes, 120 edges). The newer copy of a design wins.
- `Progress.streak.frozen?`: the day the weekly streak freeze last covered a missed day.
- `presence.beat {region, rank?}` → `presence.state`: the server keeps one row per player per Region for 90 s (a salted
  hash of the player, never their id), counts who's there, and names only public profiles (at most 12). Beats closer than
  20 s apart are ignored; answers are cached 15 s per Region.
- `score.submit {board, score}` → `leaderboard.state`: kept only for a public profile, on a known board, clamped to what a
  real round can score, best of the ISO week (UTC). `leaderboard.get {board}` reads one. `DELETE /me` removes the rows.
- In demo mode the mock answers with `practice: true` and made-up "Practice …" mayors; the UI says so.

**v2.12 additions, fair rewards (optional):**

A v2.12 client needs a v2.12 server: the server's Progress schema is strict (unknown fields fail), so an older server
refuses a save that carries `remembered`, `scored`, `bestTimed` or `bestWeek`. Deploy the server first, then the client.

- `Progress.cards[id].remembered?: true`: the card's interval reached a week once and its one-time bonus was paid. Never
  unset (an Again doesn't clear it); merged as a union.
- `Progress.games[id].scored?`: rounds that scored above 0 (the crown's game step counts these; on an older save `plays`
  stands in, on merge too: a side without it counts its `plays`). Higher wins.
- `Progress.games[id].bestTimed?` / `bestWeek?` (`YYYY-Www`, the ISO week of the UTC date, the same week the boards use): the best round played against the
  clock that week (relaxed rounds never count). The client sends only this week's `bestTimed` to `score.submit`. On merge
  the later week wins; the same week, the higher score.
- `presence.beat`'s `rank` may be `Global City`, the sixth rank (above Megacity).


**v2.13 additions, City Clients and build mode (optional):**

A v2.13 client needs a v2.13 server: the server's Progress schema is strict (unknown fields fail), so an older server
refuses a save that carries `clients` or `decor`. Deploy the server first, then the client.

- `Progress.clients?: {[businessId]: {level, done[], at?}}`: City Clients side jobs (`shared/clients.json`,
  `src/world/clients.ts`). `level` is the levels finished (0 to 3, at most 10); `done` the task ids done (at most 100,
  lowercase words and dashes), each paying its stars once ever; `at` maps a level (`"1"`) to the local date it was
  finished. At most 50 businesses. On merge: the higher `level`, the union of `done`, the earlier date per level.
- `Progress.decor?: {[regionCode]: {updatedAt, props[{id, kind, x, y, at}], spent?}}`: build mode's decorations in each Region's
  city. `kind` is the prop's atlas sprite (`^[a-z0-9][a-z0-9:-]{0,39}$`), `x`/`y` whole tiles (−64 to 256), `at` the local
  date it was placed. `spent` is the stars spent on this city's decorations, net of refunds (a whole number, 0 to
  1,000,000; absent = 0): the player's stars to spend are the stars earned minus every city's `spent`. At most 120 props a city, 20 cities and 240 props in all, so a save stays well inside the 64 KB
  body. Props are moved and removed as well as added, so a city's list is one choice: on merge the copy with the later
  `updatedAt` wins, city by city.


**v2.14 additions, City Coins (optional):**

A v2.14 client needs a v2.14 server: the server's Progress schema is strict (unknown fields fail), so an older server
refuses a save that carries `wallet`. Deploy the server first, then the client.

Stars (⭐) are knowledge: they grow buildings and are never spent. City Coins (🪙) are what the player spends
(decorations now; later combos and cosmetics), earned from side jobs, mini-game rounds, workshop steps, drawing-board
passes and finishing the day's shift (`src/state/wallet.ts` `COIN_PAY`).

- `Progress.wallet?: {earned, spent, log?, refunded?, shift?}`: coins to spend are `earned − spent`. Both are whole numbers
  (0 to 100,000,000) that only ever go up: spending adds to `spent`, and a refund (half a removed decoration's price, an
  undone purchase) adds to `earned`. The server refuses `spent > earned`. `log` is the coins earned on each of the last
  days, `[{day: "YYYY-MM-DD", coins}]` (at most 31; the client keeps 14), for "today" lines. On merge: the higher
  `earned`, the higher `spent` and the higher coins per day. Neither copy can go negative, so the merge can't; the cost
  is that coins earned (or spent) on two surfaces in the same moment, before they sync, count once (the larger).
- `refunded?`: the stars spent on decorations before v2.14 (`decor[region].spent`), given back once as coins. A v2.14
  client moves each city's old `spent` into the wallet (`earned += spent − refunded`, `refunded = spent`), drops the
  field and moves that city's `updatedAt` on a millisecond so the cleaned copy wins the next merge. A copy that still
  carries `spent` (the server, another surface, an older client) therefore never refunds the same stars twice.
  `decor[region].spent` stays in the schema so an older client can still save.
- `shift?`: the last local day (`YYYY-MM-DD`) whose finished shift paid its coins (`COIN_PAY.shift`), so the panel and
  the tab never pay the same day twice. On merge: the later day.

**v2.15 additions, loops that bring you back (optional):**

A v2.15 client needs a v2.15 server: the server's Progress schema is strict (unknown fields fail), so an older server
refuses a save that carries `lights`, `seasons`, `drops` or `codex`. Deploy the server first, then the client.

Everything here is earned and cosmetic: no coins or stars inside, nothing bought, nothing taken away.

- `Progress.lights?: {days[], total?, freezes, usedFreezes?}`: City Lights, the forgiving streak (`src/state/lights.ts`).
  `days` are the local dates (`YYYY-MM-DD`) the player learned something, the last 60, sorted; `total` the learning
  days ever (each lights a window for good); `freezes` the earned freezes held now (one per 7 learning days, 0 to 3);
  `usedFreezes` the missed days a freeze covered (at most 60). A missed day no freeze covers dims one window until a
  later learning day relights it. On merge: the union of `days` and of `usedFreezes` (the last 60 of each), the higher
  `total` (at least the number of days), and `freezes` from the copy that knows more (the later last day, then more
  freezes used), ties taking the fewer.
- `Progress.seasons?: {[seasonId]: {points, claimed[], last?}}`: the free monthly season roads (`src/state/season.ts`, a
  theme per calendar month; past seasons stay earnable). `points` (whole, 0 to 100,000) come from finished shifts, once
  a day (`last`); `claimed` the road's step indexes taken (0 to 19, at most 20). At most 24 seasons. On merge, season by
  season: the higher `points`, the union of `claimed`, the later `last`.
- `Progress.drops?: {last?, owned[]}`: the Daily Supply Drop (`src/state/drops.ts`): one cosmetic crate a day after the
  shift is done. `last` the local day a crate was opened; `owned` the cosmetic ids it gave (lowercase words, dashes and
  colons, at most 200). On merge: the later `last`, the union of `owned`.
- `Progress.codex?: {combos: {[comboId]: day}}`: the Service Codex's combos found (`shared/combos.json`), each with the
  local date first found (at most 200). Service cards and sets are read from the rest of Progress. On merge: the union,
  the earlier date per combo.

**v2.16 additions, merges that never lose a freeze, a refund or a removal (optional):**

A v2.16 client needs a v2.16 server: the server's Progress schema is strict (unknown fields fail), so an older server
refuses a save that carries any field below. Deploy the server first, then the client. Every field is optional, and a
v2.15 copy merges with a v2.16 one as described.

- `Progress.lights.freezesEarned?` / `freezesUsed?`: City Lights freezes as two counters that only go up (whole, 0 to
  100,000). Held = earned − used, at most 3; `freezes` is kept equal to it so an older client reads it. On merge: the
  higher of each counter, so a freeze earned on one surface (a season road step) and one spent on the other (a missed
  day) both count. A copy without them counts `freezes + usedFreezes.length` earned and `usedFreezes.length` used.
- `Progress.seasons[id].extra?`: crate cosmetic ids a freeze step gave instead while the freezes were full (at most 20).
  On merge: the union. Every season's road is open to everyone; a road's `points` stop at its end (100) and a finished
  shift's points past it flow into the next unfinished road (this month's, then the months before it), all marked `last`.
- `Progress.drops.overtime?`: the local day the overtime goal's bonus crate was opened (once a day). `bought?`: crate
  cosmetics bought with City Coins in Decorate (at most 200). `spares?: {[cosmeticId]: n}`: extra copies of an owned
  decoration a city may place (0 to 3 each), what a crate holds once every crate item is owned. A crate never holds a
  cosmetic the player owns from any source. On merge: the later `overtime`, the union of `bought`, the higher count per spare.
- `Progress.wallet.refundedBy?: {[regionCode]: stars}`: the old decorations' stars given back, city by city (at most 20
  cities, 0 to 1,000,000), so an older client still buying with stars in one city is refunded only what's new there.
  `refunded` stays their total. A v2.15 wallet (a total only) refunds against that total once, then city by city. On
  merge: the higher per city.
- `Progress.decor[region].gone?`: prop ids removed from that city (at most 200, the most recent). On merge, city by city
  and prop by prop: every prop in either copy unless either lists it in `gone`; a prop in both stands where the copy
  with the later `updatedAt` has it; at most 120 a city and 240 in all. A copy without `gone` (before v2.16) can't say
  what it removed, so then the later copy wins whole, as before. Undo is prop by prop too: a prop brought back after
  removal gets a new id.

