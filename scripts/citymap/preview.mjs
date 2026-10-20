// A preview PNG for `npm run city-maps -- --preview`: the snapped plan (left) beside the raw OSM drawn in the same
// turned frame (right), with the core outlined and a red north arrow. Written to .cache/city-maps/<code>.png.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { C0, C1, makeXf, N, SB, stampLine, waterMask, fillPolys } from './rasterise.mjs';

function png(file, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const RANK = { motorway: 6, trunk: 5, primary: 4, secondary: 3, tertiary: 2 };

export function writePreview(file, d, plan) {
  const S = 6;
  const W = N * S;
  const GAP = 12;
  const IW = W * 2 + GAP;
  const img = Buffer.alloc(IW * W * 3, 255);
  const px = (x, y, c) => {
    if (x < 0 || y < 0 || x >= IW || y >= W) return;
    const o = (y * IW + x) * 3;
    img[o] = c[0];
    img[o + 1] = c[1];
    img[o + 2] = c[2];
  };
  const dens = ['#efe9dc', '#e4dac4', '#d6c6a6', '#c4ad86'].map(hex);
  const WATER = hex('#5b9bd5');
  const GREEN = hex('#8cc084');
  const AVE = hex('#3a3a3a');
  const ST = hex('#7a7a7a');
  const SYN = hex('#c0504d');
  const LOT = hex('#ffffff');
  const RES = hex('#7030a0');
  const synRoad = new Uint8Array(N * N);
  for (const l of plan.lines) if (l.syn && !l.ring)
    for (let a = l.from; a <= l.to; a++) for (let k = 0; k < l.w; k++) {
      const [x, y] = l.axis === 'x' ? [a, l.pos + k] : [l.pos + k, a];
      synRoad[y * N + x] = 1;
    }
  for (let ty = 0; ty < N; ty++)
    for (let tx = 0; tx < N; tx++) {
      const i = ty * N + tx;
      const core = tx >= C0 && tx < C1 && ty >= C0 && ty < C1;
      let col = core ? dens[+plan.density[((((ty - C0) / 4) | 0) * 16) + (((tx - C0) / 4) | 0)]] : dens[0];
      if (plan.green[i]) col = GREEN;
      if (plan.water[i]) col = WATER;
      if (plan.road[i]) col = plan.road[i] === 2 ? AVE : ST;
      if (synRoad[i]) col = SYN;
      if (!core) col = col.map((v) => Math.round(v * 0.75 + 255 * 0.1));
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(tx * S + x, ty * S + y, col);
    }
  for (const [lx, ly] of plan.lots)
    for (let k = 1; k < 3 * S - 1; k++) {
      px(lx * S + k, ly * S + 1, LOT);
      px(lx * S + k, (ly + 3) * S - 2, LOT);
      px(lx * S + 1, ly * S + k, LOT);
      px((lx + 3) * S - 2, ly * S + k, LOT);
    }
  for (const r of plan.rects)
    for (let k = 0; k < SB * S; k++)
      for (const o of [0, 1, 2]) {
        px(r.x * S + k, r.y * S + o, RES);
        px(r.x * S + k, (r.y + SB) * S - 1 - o, RES);
        px(r.x * S + o, r.y * S + k, RES);
        px((r.x + SB) * S - 1 - o, r.y * S + k, RES);
      }
  // right: raw OSM in the same frame
  const OX = W + GAP;
  const xf6 = makeXf(plan.bearing, plan.rot, plan.shift, plan.mpt, S);
  const wm = waterMask(d, xf6, W, plan.mpt, S);
  const gm = new Uint8Array(W * W);
  fillPolys(d.park.map((rs) => rs.map((r) => r.map(xf6))), W, (x, y) => (gm[y * W + x] = 1));
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) px(OX + x, y, wm[y * W + x] ? WATER : gm[y * W + x] ? GREEN : dens[0]);
  const BLD = hex('#b8a888');
  for (const b of d.buildings) {
    const [u, v] = xf6(b);
    if (u >= 0 && v >= 0 && u < W && v < W) px(OX + (u | 0), v | 0, BLD);
  }
  const order = ['pedestrian', 'living_street', 'residential', 'unclassified', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway'];
  const rr = { motorway: 2.2, trunk: 2.2, primary: 1.9, secondary: 1.6, tertiary: 1.2, unclassified: 0.6, residential: 0.6, living_street: 0.4, pedestrian: 0.4 };
  const roads = d.roads.filter((r) => order.includes(r.cls)).sort((a, b) => order.indexOf(a.cls) - order.indexOf(b.cls));
  for (const r of roads) {
    const col = r.tunnel ? hex('#c8c8c8') : (RANK[r.cls] ?? 1) >= 3 ? AVE : ST;
    const pts = r.pts.map(xf6);
    for (let i = 0; i + 1 < pts.length; i++) stampLine(pts[i], pts[i + 1], rr[r.cls] ?? 0.4, W, (x, y) => px(OX + x, y, col), 0.4);
  }
  const COAST = hex('#1f4e79');
  for (const l of d.coast) {
    const pts = l.map(xf6);
    for (let i = 0; i + 1 < pts.length; i++) stampLine(pts[i], pts[i + 1], 0.8, W, (x, y) => px(OX + x, y, COAST), 0.4);
  }
  for (let k = C0 * S; k < C1 * S; k++)
    for (const o of [C0 * S, C1 * S - 1]) {
      px(OX + k, o, RES);
      px(OX + o, k, RES);
    }
  // north arrow: where north (0, +1 m) lands relative to the centre
  const [ax, ay] = xf6([0, 0]);
  const [bx, by] = xf6([0, 1000]);
  const L = Math.hypot(bx - ax, by - ay);
  const nx = (bx - ax) / L;
  const ny = (by - ay) / L;
  const RED = hex('#e00000');
  for (const ox of [0, OX]) {
    for (let t = 0; t < 30; t++) for (let w2 = -1; w2 <= 1; w2++) px(ox + 30 + Math.round(nx * t) + w2, 40 + Math.round(ny * t), RED);
    for (let w2 = -3; w2 <= 3; w2++) for (let w3 = -3; w3 <= 3; w3++) px(ox + 30 + Math.round(nx * 30) + w2, 40 + Math.round(ny * 30) + w3, RED);
  }
  png(file, IW, W, img);
}
