import { getParking } from './_lib.js'

// GET /api/parking -> { ok, parkingSum, fetchedAt, source }
export default async function handler(req, res) {
  const data = await getParking()
  // 기관 서버 부담을 줄이기 위해 1분간 캐시
  res.setHeader('Cache-Control', data.ok ? 's-maxage=60, stale-while-revalidate=120' : 'no-store')
  res.status(data.ok ? 200 : 502).json(data)
}
