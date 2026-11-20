// 받은 주차 요소를 한 줄씩 요약 (3D 좌표계: x=동쪽 m, z=북쪽 m). 사용: node list-parking.cjs <overpass-parking-all.json>
const fs = require('fs');
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const LAT0 = 37.5185, LON0 = 127.1215, MX = Math.cos((LAT0 * Math.PI) / 180) * 111320, MZ = 110574;
const area = (g) => { let a = 0; for (let i = 0; i < g.length - 1; i++) a += (g[i].lon * g[i + 1].lat - g[i + 1].lon * g[i].lat); return Math.round(Math.abs(a / 2) * MX * MZ); };
const rows = [];
for (const e of d.elements) {
  const t = e.tags || {};
  const c = e.type === 'node' ? e : e.center || (e.geometry && e.geometry[0]);
  if (!c) continue;
  const x = Math.round((c.lon - LON0) * MX), z = Math.round((c.lat - LAT0) * MZ);
  if (x < -800 || x > 950 || z < -700 || z > 650) continue;
  rows.push({ x, z, s: `${e.type[0]}${e.id} (${x},${z}) ${t.amenity || ''} ${t.parking || ''} name=${t.name || '-'} ref=${t.ref || '-'} cap=${t.capacity || '-'} access=${t.access || '-'} ${e.geometry ? area(e.geometry) + 'm2' : ''}` });
}
rows.sort((a, b) => b.z - a.z || a.x - b.x);
console.log(rows.length + ' items');
for (const r of rows) console.log(r.s);
