import { searchPlace } from './_lib.js'

// GET /api/place?q=강남역 -> { ok, places: [{ name, address, x, y }] }  (x=경도, y=위도)
export default async function handler(req, res) {
  const data = await searchPlace(req.query?.q)
  res.setHeader('Cache-Control', 'no-store')
  res.status(data.ok ? 200 : data.reason === 'bad-request' ? 400 : data.reason === 'no-key' ? 503 : 502).json(data)
}
