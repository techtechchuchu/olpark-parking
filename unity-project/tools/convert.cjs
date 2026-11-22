// OSM(Overpass JSON) -> Unity용 메쉬 JSON
// 사용: node convert.cjs <overpass결과.json> <Assets/Resources/park.json>
// 지도 데이터 (c) OpenStreetMap contributors, ODbL
const fs = require('fs');
// 인자: <입력1.json> [입력2.json ...] <출력.json>  (입력 여러 개를 합쳐서 처리)
const inputs = process.argv.slice(2, -1), OUT = process.argv[process.argv.length - 1];
const d = { elements: [] };
{
  const seen = new Set();
  // 윤곽이 들어있는 요소를 우선하도록 뒤에서부터 읽는다
  for (const f of inputs.slice().reverse()) {
    for (const e of JSON.parse(fs.readFileSync(f, 'utf8')).elements) {
      const k = e.type + e.id;
      if (seen.has(k)) continue;
      if (e.type === 'relation' && !(e.members || []).some((m) => m.geometry)) continue;
      seen.add(k);
      d.elements.push(e);
    }
  }
}
const LAT0 = 37.5185, LON0 = 127.1215;
const MX = Math.cos((LAT0 * Math.PI) / 180) * 111320, MZ = 110574;
const P = (p) => [(p.lon - LON0) * MX, (p.lat - LAT0) * MZ];
const r1 = (n) => Math.round(n * 10) / 10;
const PARK = { lon0: 127.1145, lon1: 127.13, lat0: 37.5128, lat1: 37.5245 };
const PARK_RELATION = 6185423; // 올림픽공원 경계
let parkPolys = []; // 아래에서 채움. 없으면 사각 범위로 대신 판단
const inPark = (x, z) => {
  if (parkPolys.length) return parkPolys.some((p) => pip(x, z, p));
  const lon = x / MX + LON0, lat = z / MZ + LAT0;
  return lon > PARK.lon0 && lon < PARK.lon1 && lat > PARK.lat0 && lat < PARK.lat1;
};

function area(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return a / 2;
}
function ring(geom) {
  const pts = geom.map(P);
  const out = [];
  for (const p of pts) {
    if (!out.length || Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) > 0.05) out.push(p);
  }
  if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 0.05) out.pop();
  if (out.length < 3) return null;
  if (area(out) < 0) out.reverse(); // 반시계 방향으로 통일
  return out;
}
function centroid(p) {
  let x = 0, z = 0;
  for (const q of p) { x += q[0]; z += q[1]; }
  return [x / p.length, z / p.length];
}
function pip(x, z, p) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if (p[i][1] > z !== p[j][1] > z && x < ((p[j][0] - p[i][0]) * (z - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  }
  return c;
}
function earclip(p) {
  const n = p.length, idx = [...Array(n).keys()], tris = [];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inTri = (q, a, b, c) => cross(a, b, q) >= 0 && cross(b, c, q) >= 0 && cross(c, a, q) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      if (cross(p[ia], p[ib], p[ic]) <= 1e-9) continue;
      let ok = true;
      for (const k of idx) {
        if (k === ia || k === ib || k === ic) continue;
        if (inTri(p[k], p[ia], p[ib], p[ic])) { ok = false; break; }
      }
      if (!ok) continue;
      tris.push(ia, ib, ic);
      idx.splice(i, 1);
      cut = true;
      break;
    }
    if (!cut) idx.splice(0, 1); // 퇴화 다각형: 한 점 버리고 계속
  }
  if (idx.length === 3) tris.push(idx[0], idx[1], idx[2]);
  return tris;
}

// Unity는 위에서 볼 때 시계 방향 삼각형이 앞면
class Mesh {
  constructor(name, color) { this.name = name; this.color = color; this.v = []; this.t = []; }
  flat(p, y) {
    const b = this.v.length / 3;
    for (const q of p) this.v.push(r1(q[0]), y, r1(q[1]));
    const t = earclip(p);
    for (let i = 0; i < t.length; i += 3) this.t.push(b + t[i], b + t[i + 2], b + t[i + 1]);
  }
  walls(p, h) {
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length], b = this.v.length / 3;
      this.v.push(r1(a[0]), 0, r1(a[1]), r1(c[0]), 0, r1(c[1]), r1(c[0]), h, r1(c[1]), r1(a[0]), h, r1(a[1]));
      this.t.push(b, b + 3, b + 2, b, b + 2, b + 1);
    }
  }
  strip(a, b2, w, y) {
    const len = Math.hypot(b2[0] - a[0], b2[1] - a[1]);
    if (len < 0.2) return;
    const nx = (-(b2[1] - a[1]) / len) * w, nz = ((b2[0] - a[0]) / len) * w;
    const b = this.v.length / 3;
    this.v.push(r1(a[0] + nx), y, r1(a[1] + nz), r1(b2[0] + nx), y, r1(b2[1] + nz), r1(b2[0] - nx), y, r1(b2[1] - nz), r1(a[0] - nx), y, r1(a[1] - nz));
    this.t.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  cone(x, z, r, y0, y1) {
    const n = 5, rot = Math.random() * 6;
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i * 2 * Math.PI) / n, a1 = rot + ((i + 1) * 2 * Math.PI) / n, k = this.v.length / 3;
      this.v.push(r1(x + Math.cos(a0) * r), y0, r1(z + Math.sin(a0) * r), r1(x), y1, r1(z), r1(x + Math.cos(a1) * r), y0, r1(z + Math.sin(a1) * r));
      this.t.push(k, k + 1, k + 2);
    }
  }
  out() { const [r, g, b] = this.color; return { name: this.name, r, g, b, v: this.v, t: this.t }; }
}
const hex = (h) => [1, 3, 5].map((i) => +(parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3));
const L = {
  park: new Mesh('park', hex('#c9e2a8')),
  mainroad: new Mesh('mainroad', hex('#c3c8cf')),
  grass: new Mesh('grass', hex('#b3d894')),
  wood: new Mesh('wood', hex('#97c784')),
  pitch: new Mesh('pitch', hex('#a5cf7a')),
  water: new Mesh('water', hex('#9fd0ee')),
  road: new Mesh('road', hex('#d5d8dc')),
  path: new Mesh('path', hex('#f3efe2')),
  parkingOther: new Mesh('parkingOther', hex('#c9ced4')),
  city: new Mesh('city', hex('#e6e8ec')),
  parkB: new Mesh('parkBuildings', hex('#f2efe8')),
  venue: new Mesh('venues', hex('#ffffff')),
  trees: new Mesh('trees', hex('#3f8a50')),
};
// OSM 이름 -> [표시 이름, 높이(m, 추정)]
const VENUES = {
  올림픽체조경기장: ['KSPO DOME', 24],
  올림픽홀: ['올림픽홀', 18],
  SK올림픽핸드볼경기장: ['핸드볼경기장', 20],
  우리금융아트홀: ['우리금융아트홀', 16],
  올림픽수영경기장: ['올림픽수영장', 20],
  야외무대: ['88잔디마당 야외무대', 8],
  올림픽컨벤션센터: ['컨벤션센터', 12],
  한성백제박물관: ['한성백제박물관', 12],
  서울올림픽기념관: ['올림픽기념관', 14],
  '올림픽공원 세계평화의문': ['세계평화의문', 24],
};
const ROAD_W = { trunk: 13, primary: 11, secondary: 8, tertiary: 6, residential: 3.2, unclassified: 3.2 };
const EXCLUDE_LOT = /아마노|아산|한체대|방이공영/;
const venues = [], lots = [], blockers = [], woods = [];
let dome = null;

function stitch(parts) {
  // 관계(relation)의 조각난 외곽선을 고리로 잇기
  const out = [];
  parts = parts.map((g) => g.slice());
  const same = (a, b) => Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lon - b.lon) < 1e-7;
  while (parts.length) {
    let cur = parts.shift(), grew = true;
    while (!same(cur[0], cur[cur.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < parts.length; i++) {
        const g = parts[i], end = cur[cur.length - 1];
        if (same(end, g[0])) cur = cur.concat(g.slice(1));
        else if (same(end, g[g.length - 1])) cur = cur.concat(g.slice().reverse().slice(1));
        else continue;
        parts.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (same(cur[0], cur[cur.length - 1])) out.push(cur);
  }
  return out;
}
const rings = (e) => (e.geometry ? [e.geometry] : stitch((e.members || []).filter((m) => m.role !== 'inner' && m.geometry).map((m) => m.geometry)));

{
  const rel = d.elements.find((e) => e.type === 'relation' && e.id === PARK_RELATION);
  if (rel) parkPolys = rings(rel).map(ring).filter(Boolean);
  for (const p of parkPolys) L.park.flat(p, 0.03);
  console.log('park boundary rings', parkPolys.length, parkPolys.map((p) => Math.round(Math.abs(area(p))) + 'm2').join(' '));
}

for (const e of d.elements) {
  const t = e.tags || {};
  if (e.type === 'relation' && e.id === PARK_RELATION) continue;
  if (t.waterway) continue;
  if (t.highway) {
    if (!e.geometry) continue;
    const pts = e.geometry.map(P);
    if (ROAD_W[t.highway]) {
      for (let i = 0; i < pts.length - 1; i++) L.mainroad.strip(pts[i], pts[i + 1], ROAD_W[t.highway], 0.18);
      continue;
    }
    const service = t.highway === 'service';
    const w = service ? 3 : t.highway === 'pedestrian' ? 3.5 : 1.6;
    for (let i = 0; i < pts.length - 1; i++) (service ? L.road : L.path).strip(pts[i], pts[i + 1], w, service ? 0.25 : 0.3);
    continue;
  }
  for (const g of rings(e)) {
    const p = ring(g);
    if (!p) continue;
    const [cx, cz] = centroid(p), A = Math.abs(area(p));
    if (t.building) {
      const v = VENUES[t.name];
      let h = v ? v[1] : parseFloat(t.height) || parseFloat(t['building:levels']) * 3 || (inPark(cx, cz) ? 7 : 10);
      const m = v ? L.venue : inPark(cx, cz) ? L.parkB : L.city;
      // 공원 밖 건물은 배경이므로 낮춰서 공원이 가려지지 않게 한다
      h = r1(m === L.city ? Math.min(h, 130) * 0.35 : Math.min(h, 130));
      m.walls(p, h);
      m.flat(p, h);
      blockers.push(p);
      if (v) {
        venues.push({ name: v[0], x: r1(cx), z: r1(cz), h });
        if (t.name === '올림픽체조경기장') dome = { x: r1(cx), z: r1(cz), r: r1(Math.sqrt(A / Math.PI)), h };
      }
    } else if (t.amenity === 'parking') {
      blockers.push(p);
      if (inPark(cx, cz) && !EXCLUDE_LOT.test(t.name || '') && A > 900) {
        const m = new Mesh('lot', [0, 0, 0]);
        m.flat(p, 0.4);
        const xs = p.map((q) => q[0]), zs = p.map((q) => q[1]);
        lots.push({ osm: String(e.id), name: t.name || '', x: r1(cx), z: r1(cz), area: Math.round(A), v: m.v, t: m.t,
          outline: p.flatMap((q) => [r1(q[0]), r1(q[1])]), minX: r1(Math.min(...xs)), maxX: r1(Math.max(...xs)), minZ: r1(Math.min(...zs)), maxZ: r1(Math.max(...zs)) });
      } else L.parkingOther.flat(p, 0.35);
    } else if (t.natural === 'water') { L.water.flat(p, 0.2); blockers.push(p); }
    else if (t.natural === 'wood') { L.wood.flat(p, 0.12); woods.push(p); }
    else if (t.landuse === 'grass') L.grass.flat(p, 0.1);
    else if (t.leisure === 'pitch') { L.pitch.flat(p, 0.15); blockers.push(p); }
    else if (t.leisure === 'park' && A < 60000) L.grass.flat(p, 0.08);
  }
}

// 나무: 숲 영역 + 공원 안 빈 곳 (항상 같은 결과가 나오도록 고정 시드)
let seed = 7;
Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const free = (x, z) => !blockers.some((b) => pip(x, z, b));
let trees = 0;
const tree = (x, z) => { L.trees.cone(x, z, 3 + Math.random() * 2, 1.5, 8 + Math.random() * 6); trees++; };
for (const w of woods) {
  const xs = w.map((q) => q[0]), zs = w.map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const cnt = Math.min(120, Math.round(Math.abs(area(w)) / 400));
  for (let i = 0, tries = 0; i < cnt && tries < cnt * 8; tries++) {
    const x = x0 + Math.random() * (x1 - x0), z = z0 + Math.random() * (z1 - z0);
    if (pip(x, z, w) && free(x, z)) { tree(x, z); i++; }
  }
}
for (let i = 0; i < 2600 && trees < 1100; i++) {
  const x = (PARK.lon0 - 0.004 - LON0 + Math.random() * (PARK.lon1 - PARK.lon0 + 0.006)) * MX;
  const z = (PARK.lat0 - 0.001 - LAT0 + Math.random() * (PARK.lat1 - PARK.lat0 + 0.003)) * MZ;
  if (inPark(x, z) && free(x, z)) tree(x, z);
}

// 공식 주차구역과 맞지 않는 윤곽 보정 (P4·P5 나누기, P7 추정 윤곽). 내용은 lot-fixes.cjs
require('./lot-fixes.cjs').applyLotFixes(lots);
const out = { layers: Object.values(L).filter((m) => m.t.length).map((m) => m.out()), lots, venues, dome };
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('layers', out.layers.map((l) => `${l.name}:${l.v.length / 3}v`).join(' '));
console.log('trees', trees);
console.log('venues', venues.map((v) => `${v.name}(${v.x},${v.z})`).join(' '));
console.log('dome', JSON.stringify(dome));
console.log('lots\n' + lots.map((l) => `  ${l.osm} | ${l.name || '(이름 없음)'} | ${l.area}m2 | (${l.x},${l.z})`).join('\n'));
