// Builds shared/aws-catalog.json: AWS-scale facts the city shows ("37 built of over 200 AWS services", edge locations),
// each read from an AWS page through the public AWS Knowledge MCP server (no credentials) with the sentence it came
// from, never typed in. Regions and Availability Zones come from shared/region-facts.json (npm run region-facts).
//
// Usage: npm run aws-catalog
// Dev-time only. The game's agents never get these tools (server/src/knowledge/mcp.ts ALLOWED_TOOLS).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'shared', 'aws-catalog.json');
const MCP = 'https://knowledge-mcp.global.api.aws';
const OVERVIEW = 'https://docs.aws.amazon.com/whitepapers/latest/aws-overview/introduction.html';
const POPS = 'https://docs.aws.amazon.com/whitepapers/latest/aws-fault-isolation-boundaries/points-of-presence.html';

let session;
let nextId = 1;
const rpc = async (method, params, notify = false) => {
  const res = await fetch(MCP, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(session ? { 'mcp-session-id': session } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, ...(notify ? {} : { id: nextId++ }) }),
  });
  session = res.headers.get('mcp-session-id') ?? session;
  if (notify) return undefined;
  const text = await res.text();
  const json = text.trimStart().startsWith('{') ? text : text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).at(-1);
  const msg = JSON.parse(json ?? '{}');
  if (msg.error) throw new Error(`${method}: ${msg.error.message}`);
  return msg.result;
};
const readDoc = async (url) => {
  const r = await rpc('tools/call', { name: 'aws___read_documentation', arguments: { requests: [{ url, max_length: 20000 }] } });
  const page = JSON.parse(r.content.map((c) => c.text ?? '').join('')).content.result[0];
  if (page.status !== 'SUCCESS') throw new Error(`${url}: ${page.status}`);
  return page.content.replace(/\s+/g, ' ');
};
const need = (text, re, what) => {
  const m = text.match(re);
  if (!m) throw new Error(`Couldn't find ${what}; the page may have changed. Nothing written.`);
  return m;
};

await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'aws-city-catalog', version: '1' } });
await rpc('notifications/initialized', {}, true);

const overview = await readDoc(OVERVIEW);
const services = need(overview, /over (\d{3}) AWS services/, 'the services count');
const pops = await readDoc(POPS);
const edge = need(pops, /over (\d+) PoPs, including more than (\d+) Edge Locations, and (\d+) regional mid-tier caches in over (\d+) cities across (\d+) countries/, 'the edge network sentence');

const out = {
  asOf: new Date().toISOString().slice(0, 10),
  source: `${MCP} (AWS Knowledge MCP Server)`,
  services: { atLeast: Number(services[1]), text: services[0], source: OVERVIEW },
  edge: {
    pops: Number(edge[1]),
    edgeLocations: Number(edge[2]),
    regionalCaches: Number(edge[3]),
    cities: Number(edge[4]),
    countries: Number(edge[5]),
    text: edge[0],
    source: POPS,
  },
};
fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
console.log(`wrote ${path.relative(ROOT, OUT)}: over ${out.services.atLeast} services, ${out.edge.pops} PoPs`);
