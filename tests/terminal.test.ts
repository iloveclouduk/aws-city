import { describe, expect, it } from 'vitest';
import { explainError, fillNames, hintWord, nextWord, run, tabComplete, tokenize, type TerminalStep } from '@/learning/terminal';
import { WORKSHOPS, terminalStep } from '@/world/workshops';

// The practice terminal reads a command like a shell, accepts flags in any order, and teaches the real CLI's errors.
const step: TerminalStep = {
  cli: 'aws dynamodb create-table --table-name <table> --attribute-definitions AttributeName=pk,AttributeType=S --key-schema AttributeName=pk,KeyType=HASH --billing-mode PAY_PER_REQUEST [--region <region>]',
  output: '{ "TableDescription": { "TableName": "{{table}}", "TableStatus": "CREATING" } }',
  errors: [
    {
      code: 'ValidationException',
      message: 'An error occurred (ValidationException) when calling the CreateTable operation: No provisioned throughput specified',
      when: { missing: '--billing-mode' },
      explain: 'Without a billing mode the table defaults to provisioned capacity, which needs throughput numbers.',
      fix: 'Add --billing-mode PAY_PER_REQUEST.',
    },
    {
      code: 'ResourceInUseException',
      message: 'An error occurred (ResourceInUseException) when calling the CreateTable operation: Table already exists: city-demo',
      when: { flag: '--table-name', value: '^city-demo$' },
      explain: 'Table names are unique per Region in your account.',
      fix: 'Pick another name, or delete the old table first.',
    },
  ],
};

describe('practice terminal', () => {
  it('splits like a shell: quotes, escapes and line continuations', () => {
    expect(tokenize(`aws s3 cp "my file.txt" s3://b/ \\\n  --acl 'private'`)).toEqual(['aws', 's3', 'cp', 'my file.txt', 's3://b/', '--acl', 'private']);
    expect(tokenize('echo a\\ b ""')).toEqual(['echo', 'a b', '']);
  });

  it('accepts the expected command with flags in any order and echoes placeholders', () => {
    const r = run(
      'aws dynamodb create-table --billing-mode PAY_PER_REQUEST --key-schema AttributeName=pk,KeyType=HASH --table-name orders --attribute-definitions AttributeName=pk,AttributeType=S',
      step,
    );
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.output).toContain('"TableName": "orders"');
      expect(r.values.table).toBe('orders');
    }
  });

  it('allows `--flag=value` and optional flags', () => {
    const r = run('aws dynamodb create-table --table-name=t1 --attribute-definitions AttributeName=pk,AttributeType=S --key-schema AttributeName=pk,KeyType=HASH --billing-mode PAY_PER_REQUEST --region eu-west-2', step);
    expect(r.kind).toBe('ok');
  });

  it('teaches a known mistake with the real error text', () => {
    const r = run('aws dynamodb create-table --table-name t --attribute-definitions AttributeName=pk,AttributeType=S --key-schema AttributeName=pk,KeyType=HASH', step);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.fix).toMatch(/PAY_PER_REQUEST/);
    const taken = run('aws dynamodb create-table --table-name city-demo --attribute-definitions AttributeName=pk,AttributeType=S --key-schema AttributeName=pk,KeyType=HASH --billing-mode PAY_PER_REQUEST', step);
    expect(taken.kind === 'error' && taken.error.code).toBe('ResourceInUseException');
  });

  it('names what is off when it is not a taught mistake', () => {
    expect(run('aws s3 ls', step)).toMatchObject({ kind: 'other', output: expect.stringContaining('aws dynamodb create-table') });
    expect(run('rm -rf /', step)).toMatchObject({ kind: 'other', output: expect.stringContaining('only runs the AWS CLI') });
    expect(run('aws dynamodb create-table --table-name t --billing-mode PAY_PER_REQUEST --key-schema AttributeName=pk,KeyType=HASH', step)).toMatchObject({
      output: 'aws: [ERROR]: An error occurred (ParamValidation): the following arguments are required: --attribute-definitions',
    });
    expect(run('aws dynamodb create-table --table-name t --attribute-definitions AttributeName=id,AttributeType=S --key-schema AttributeName=pk,KeyType=HASH --billing-mode PAY_PER_REQUEST', step)).toMatchObject({
      output: expect.stringContaining('Close.'),
    });
    expect(run('   ', step)).toEqual({ kind: 'empty' });
  });

  it('matches placeholders inside a word', () => {
    const s3: TerminalStep = { cli: 'aws s3 mb s3://<bucket>', output: 'make_bucket: {{bucket}}' };
    expect(run('aws s3 mb s3://city-logs-42', s3)).toMatchObject({ kind: 'ok', output: 'make_bucket: city-logs-42' });
    expect(run('aws s3 mb city-logs-42', s3).kind).toBe('other');
  });

  it('refuses the command pasted with its placeholders, and teaches what to type instead', () => {
    const shown = 'aws dynamodb create-table --table-name <table> --attribute-definitions AttributeName=pk,AttributeType=S --key-schema AttributeName=pk,KeyType=HASH --billing-mode PAY_PER_REQUEST';
    expect(run(shown, step)).toEqual({ kind: 'other', output: 'Swap `<table>` for a name of your own, like `orders`.' });
    expect(run(shown.replace('<table>', '{{table}}'), step).kind).toBe('other');
    const s3: TerminalStep = { cli: 'aws s3 mb s3://<bucket>', output: 'make_bucket: {{bucket}}' };
    expect(run('aws s3 mb s3://<bucket>', s3)).toMatchObject({ kind: 'other', output: expect.stringContaining('`<bucket>`') });
    // An id or URL from an earlier step: no made-up example.
    const q: TerminalStep = { cli: 'aws sqs get-queue-attributes --queue-url <queue-url>', output: '{}' };
    expect(run('aws sqs get-queue-attributes --queue-url <queue-url>', q)).toMatchObject({ output: expect.stringContaining('an earlier step') });
    // Captures hold real values only.
    expect(run(shown.replace('<table>', '" "'), step).kind).toBe('other');
  });

  it('compares JSON values by meaning', () => {
    const s: TerminalStep = { cli: `aws lambda invoke --function-name f --payload '{"a":1}' out.json`, output: 'ok' };
    expect(run(`aws lambda invoke --payload '{ "a": 1 }' --function-name f out.json`, s).kind).toBe('ok');
  });

  it('explains a pasted error by its code', () => {
    expect(explainError('An error occurred (ResourceInUseException) when calling...', step.errors)?.fix).toMatch(/another name/);
    expect(explainError('something else', step.errors)).toBeUndefined();
  });
});

describe('typing help', () => {
  const cli = step.cli;
  it('Tab types the command words, finishes a started flag, and fills a name used before', () => {
    expect(tabComplete('', cli).line).toBe('aws ');
    expect(tabComplete('aws dyn', cli).line).toBe('aws dynamodb ');
    expect(tabComplete('aws dynamodb ', cli).line).toBe('aws dynamodb create-table ');
    // A flag needs its first letters: not knowing what comes next is what Hint is for.
    expect(tabComplete('aws dynamodb create-table ', cli)).toMatchObject({ line: 'aws dynamodb create-table ', note: expect.stringMatching(/Hint/) });
    expect(tabComplete('aws dynamodb create-table --ta', cli).line).toBe('aws dynamodb create-table --table-name ');
    expect(tabComplete('aws dynamodb create-table --bil', cli).line).toBe('aws dynamodb create-table --billing-mode ');
    // No name yet: Tab teaches instead of typing `<table>`; with a name from an earlier step, it types it.
    const none = tabComplete('aws dynamodb create-table --table-name ', cli);
    expect(none.line).toBe('aws dynamodb create-table --table-name ');
    expect(none.note).toMatch(/orders/);
    expect(tabComplete('aws dynamodb create-table --table-name ', cli, { table: 'shop' }).line).toBe('aws dynamodb create-table --table-name shop ');
    expect(tabComplete('aws dynamodb create-table --table-name sh', cli, { table: 'shop' }).line).toBe('aws dynamodb create-table --table-name shop ');
    // A value that isn't a placeholder completes from nothing.
    expect(tabComplete('aws dynamodb create-table --billing-mode ', cli).line).toBe('aws dynamodb create-table --billing-mode PAY_PER_REQUEST ');
    expect(tabComplete('aws s3 ', cli).line).toBe('aws s3 ');
  });

  it('Hint shows the next flag in order, skipping those given, and nothing once the command is whole', () => {
    expect(nextWord('aws dynamodb create-table ', cli)).toMatchObject({ kind: 'flag', shown: '--table-name' });
    expect(nextWord('aws dynamodb create-table --billing-mode PAY_PER_REQUEST --table-name t ', cli)?.shown).toBe('--attribute-definitions');
    expect(nextWord('aws dynamodb create-table --table-name ', cli)).toMatchObject({ kind: 'value', shown: '<table>', placeholder: 'table' });
    const whole = 'aws dynamodb create-table --table-name t --attribute-definitions AttributeName=pk,AttributeType=S --key-schema AttributeName=pk,KeyType=HASH --billing-mode PAY_PER_REQUEST ';
    expect(nextWord(whole, cli)).toBeUndefined();
    expect(run(whole, step).kind).toBe('ok');
  });

  it('quotes JSON values so the shell keeps them whole', () => {
    const put = { cli: `aws dynamodb put-item --table-name <table> --item '{"pk":{"S":"order#1"}}'`, output: '' };
    const line = tabComplete('aws dynamodb put-item --table-name shop --it', put.cli).line;
    const done = tabComplete(line, put.cli).line;
    expect(done).toBe(`aws dynamodb put-item --table-name shop --item '{"pk":{"S":"order#1"}}' `);
    expect(run(done, put).kind).toBe('ok');
  });

  it('Tab and Hint alone can type every workshop command, given the names', () => {
    for (const w of WORKSHOPS)
      for (const s of w.steps) {
        const t = terminalStep(s);
        if (!t) continue;
        const names = Object.fromEntries([...t.cli.matchAll(/<([a-z0-9-]+)>/gi)].map((m) => [m[1], `demo-${m[1]}`]));
        let line = '';
        for (let i = 0; i < 60; i++) {
          const n = nextWord(line, t.cli, names);
          if (!n) break;
          line = n.line ?? line;
          if (!n.line) break;
        }
        expect(run(line, t).kind, `${w.id}/${s.id}: ${line}`).toBe('ok');
      }
  });

  it('Fill my names swaps placeholders for names used before', () => {
    expect(fillNames('aws dynamodb get-item --table-name <table> --key <key>', { table: 'shop' })).toBe('aws dynamodb get-item --table-name shop --key <key>');
  });

  it('Hint never stops at a placeholder: asked again there, it finishes the word with an example name', () => {
    const cli = 'aws s3 cp seat-map.png s3://<bucket>/seat-map.png';
    let line = '';
    for (let i = 0; i < 10; i++) {
      const n = hintWord(line, cli);
      if (!n?.line) break;
      line = n.line;
    }
    expect(line.trim()).toBe('aws s3 cp seat-map.png s3://my-city-bucket-2026/seat-map.png');
    expect(hintWord('aws s3 cp seat-map.png s3://', cli)?.example).toEqual({ name: 'bucket', value: 'my-city-bucket-2026' });
    expect(run(line, { cli, output: 'upload: ./seat-map.png to s3://{{bucket}}/seat-map.png' }).kind).toBe('ok');
  });
});

describe('the real CLI’s other spellings', () => {
  const seat: TerminalStep = { cli: 'aws s3 cp seat-map.png s3://<bucket>/seat-map.png', output: 'upload: ./seat-map.png to s3://{{bucket}}/seat-map.png' };
  it('a copy to s3://bucket, with or without the slash, keeps the file name as its key', () => {
    for (const line of ['aws s3 cp seat-map.png s3://arena-bucket', 'aws s3 cp seat-map.png s3://arena-bucket/', 'aws s3 cp ./seat-map.png s3://arena-bucket/seat-map.png']) {
      const r = run(line, seat);
      expect(r.kind, line).toBe('ok');
      expect(r.kind === 'ok' && r.output).toBe('upload: ./seat-map.png to s3://arena-bucket/seat-map.png');
    }
  });
  it('a different key is still a different command', () => {
    expect(run('aws s3 cp seat-map.png s3://arena-bucket/other.png', seat).kind).toBe('other');
    expect(run('aws s3 cp other.png s3://arena-bucket', seat).kind).toBe('other');
  });
});
