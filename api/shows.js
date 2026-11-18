import { getShows } from './_lib.js'

// GET /api/shows -> { ok, shows: [...] }  (KCISA_SERVICE_KEY 가 없으면 { ok:false, reason:'no-key' })
export default async function handler(req, res) {
  const data = await getShows()
  res.setHeader('Cache-Control', data.ok ? 's-maxage=3600, stale-while-revalidate=86400' : 'no-store')
  res.status(data.ok ? 200 : data.reason === 'no-key' ? 503 : 502).json(data)
}
