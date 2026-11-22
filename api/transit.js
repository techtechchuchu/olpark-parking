import { getTransit } from './_lib.js'

// GET /api/transit?sx=경도&sy=위도&ex=경도&ey=위도 -> { ok, routes: [{ minutes, transfers, fare, steps }] }
// 카카오 이용 정책상 결과를 저장·재사용하지 않으므로 캐시하지 않는다.
export default async function handler(req, res) {
  const q = req.query ?? {}
  const data = await getTransit({ sx: q.sx, sy: q.sy, ex: q.ex, ey: q.ey })
  res.setHeader('Cache-Control', 'no-store')
  res.status(data.ok ? 200 : data.reason === 'bad-request' ? 400 : data.reason === 'no-key' ? 503 : 502).json(data)
}
