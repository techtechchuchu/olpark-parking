// 받은 역·출입구를 3D 좌표계(x=동쪽 m, z=북쪽 m)로 요약. 사용: node list-stations.cjs <overpass-stations.json>
const fs = require('fs');
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const LAT0 = 37.5185, LON0 = 127.1215, MX = Math.cos((LAT0 * Math.PI) / 180) * 111320, MZ = 110574;
for (const e of d.elements) {
  const t = e.tags || {}, c = e.type === 'node' ? e : e.center;
  if (!c) continue;
  const x = Math.round((c.lon - LON0) * MX), z = Math.round((c.lat - LAT0) * MZ);
  const kind = t.railway === 'subway_entrance' ? 'entrance' : 'station';
  console.log(`${kind} | ${t.name || '-'} | ref=${t.ref || '-'} | line=${t.line || t.network || '-'} | (${x},${z}) | ${c.lat.toFixed(5)},${c.lon.toFixed(5)}`);
}
