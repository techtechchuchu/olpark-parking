// 주차구역 윤곽 보정: OpenStreetMap 윤곽만으로는 공식 주차구역(P4·P5·P7)과 맞지 않는 곳을 고친다.
//   1) OSM way 76425856 은 KSPO DOME 동쪽(P5)과 올림픽수영장 쪽(P4)이 한 덩어리다. 가장 좁은 목(z = SPLIT_Z)에서 둘로 나눈다.
//      남쪽은 기존 번호 그대로(P5), 북쪽은 '76425856-N'(P4).
//   2) P7(우리금융아트홀 남쪽)은 OSM 에 윤곽이 없다. 아트홀 남쪽 벽과 진입로(OSM way 474020307) 사이를 추정해서 그린 것이라
//      실제 경계와 다를 수 있다. 번호는 'est-p7' (est = 추정).
// 쓰는 곳: convert.cjs 가 park.json 을 만들 때 부르고, 이미 만든 park.json 에 바로 적용할 수도 있다 (여러 번 돌려도 결과가 같다).
//   node lot-fixes.cjs ../Assets/Resources/park.json
// 여기서 정한 번호는 src/data.ts 의 LOTS[].osm 과 같아야 한다.
const fs = require('fs');
const r1 = (n) => Math.round(n * 10) / 10;
const SPLIT_OSM = '76425856', SPLIT_Z = 238, NORTH_OSM = '76425856-N';
const P7 = { osm: 'est-p7', name: 'P7 (추정 윤곽)', poly: [[226, -312], [260, -302], [291, -297], [293, -246], [224, -256]] };

const signedArea = (p) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
// 귀 자르기 삼각분할 (반시계 방향 다각형). convert.cjs 의 earclip 과 같은 방식
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
      if (idx.some((k) => k !== ia && k !== ib && k !== ic && inTri(p[k], p[ia], p[ib], p[ic]))) continue;
      tris.push(ia, ib, ic); idx.splice(i, 1); cut = true; break;
    }
    if (!cut) idx.splice(0, 1);
  }
  if (idx.length === 3) tris.push(idx[0], idx[1], idx[2]);
  return tris;
}
/** 다각형 → park.json 의 주차장 항목 (convert.cjs 와 같은 모양: 높이 0.4, Unity 앞면은 시계 방향) */
function makeLot(osm, name, poly) {
  let p = poly.map((q) => [r1(q[0]), r1(q[1])]);
  if (signedArea(p) < 0) p = p.reverse();
  const t = earclip(p), tri = [];
  for (let i = 0; i < t.length; i += 3) tri.push(t[i], t[i + 2], t[i + 1]);
  const xs = p.map((q) => q[0]), zs = p.map((q) => q[1]);
  return { osm, name, x: r1(xs.reduce((a, b) => a + b, 0) / p.length), z: r1(zs.reduce((a, b) => a + b, 0) / p.length), area: Math.round(Math.abs(signedArea(p))),
    v: p.flatMap((q) => [q[0], 0.4, q[1]]), t: tri, outline: p.flat(), minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}
/** z = c 가로선으로 잘라 keepNorth 쪽만 남긴다 (선이 윤곽을 두 번만 지나는 경우에 쓴다) */
function clipZ(p, c, keepNorth) {
  const inside = (q) => (keepNorth ? q[1] >= c : q[1] <= c), out = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) out.push([a[0] + ((b[0] - a[0]) * (c - a[1])) / (b[1] - a[1]), c]);
  }
  return out;
}

function applyLotFixes(lots) {
  const whole = lots.find((l) => l.osm === SPLIT_OSM);
  if (whole && !lots.some((l) => l.osm === NORTH_OSM)) {
    const p = [];
    for (let i = 0; i + 1 < whole.outline.length; i += 2) p.push([whole.outline[i], whole.outline[i + 1]]);
    const crossings = p.filter((a, i) => a[1] > SPLIT_Z !== p[(i + 1) % p.length][1] > SPLIT_Z).length;
    if (crossings !== 2) throw new Error(`윤곽이 바뀌어 z=${SPLIT_Z} 에서 둘로 나눌 수 없습니다 (교차 ${crossings}회)`);
    lots[lots.indexOf(whole)] = makeLot(SPLIT_OSM, whole.name, clipZ(p, SPLIT_Z, false));
    lots.push(makeLot(NORTH_OSM, whole.name, clipZ(p, SPLIT_Z, true)));
  }
  if (!lots.some((l) => l.osm === P7.osm)) lots.push(makeLot(P7.osm, P7.name, P7.poly));
  lots.sort((a, b) => b.area - a.area);
  return lots;
}
module.exports = { applyLotFixes };

if (require.main === module) {
  const file = process.argv[2];
  const park = JSON.parse(fs.readFileSync(file, 'utf8'));
  applyLotFixes(park.lots);
  fs.writeFileSync(file, JSON.stringify(park));
  console.log(park.lots.map((l) => `${l.osm} | ${l.name || '(이름 없음)'} | ${l.area}m2 | (${l.x},${l.z}) | 삼각형 ${l.t.length / 3}`).join('\n'));
}
