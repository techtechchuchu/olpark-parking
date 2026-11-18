import { getLinked } from './_lib.js'

// GET /api/linked?page=1 -> { ok, total, rows: [{ at, cars, visitors, temp, rain, holiday, show, audience }] }
export default async function handler(req, res) {
  const page = Math.max(1, Math.min(20, Number(req.query?.page) || 1))
  const data = await getLinked(page)
  res.setHeader('Cache-Control', data.ok ? 's-maxage=86400, stale-while-revalidate=604800' : 'no-store')
  res.status(data.ok ? 200 : data.reason === 'no-key' ? 503 : 502).json(data)
}
