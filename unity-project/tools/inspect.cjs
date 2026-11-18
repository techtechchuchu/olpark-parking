// 받은 Overpass 파일 요약. 사용: node inspect.cjs <park.json> <roads.json>
const fs = require('fs');
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const e of d.elements.filter((e) => e.type === 'relation')) {
  const m = e.members || [];
  console.log(e.id, JSON.stringify(e.tags || {}).slice(0, 160), 'members', m.length, [...new Set(m.map((x) => x.type + '/' + x.role + '/' + !!x.geometry))].join(' '));
}
const head = fs.readFileSync(process.argv[3], 'utf8');
console.log('roads file bytes', head.length, head.slice(0, 80).replace(/\s+/g, ' '));
try {
  const r = JSON.parse(head);
  const c = {};
  for (const e of r.elements) { const k = (e.tags || {}).highway || 'ww:' + (e.tags || {}).waterway; c[k] = (c[k] || 0) + 1; }
  console.log(c);
} catch (err) { console.log('roads parse fail', String(err).slice(0, 100)); }
