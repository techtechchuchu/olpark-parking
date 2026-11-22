// 공공데이터 호출 공통 로직. Vercel 함수(api/*.js)와 로컬 개발 서버(vite.config.ts)가 같이 쓴다.
// 이름이 _ 로 시작하는 파일은 Vercel 이 주소로 노출하지 않는다.

// 한국체육산업개발 "올림픽공원 실시간 주차현황" (동2문/남2문/북2문 합계 주차대수)
// 주소와 apiKey 는 기관 공공데이터 개방목록에 공개된 값: https://www.ksponco.or.kr/pubData/64?mid=a10106020000
const PARKING_URL = 'https://www.ksponco.or.kr/online/main/parkingorsApi.do'
const PARKING_PUBLIC_KEY = 'PARKING21803504'

// 문화공공데이터광장(culture.go.kr) 오픈API. 활용신청 후 받은 서비스키를 KCISA_SERVICE_KEY 환경변수로 넣어야 동작한다.
const KCISA = {
  shows: 'https://api.kcisa.kr/openapi/service/rest/meta/KSCperf', // 올림픽공원 공연정보
  linked: 'https://api.kcisa.kr/openapi/API_CPM_009/request', // 2025 차량입출차·공연·날씨 연계 데이터
}

async function getJson(url, timeoutMs = 8000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return JSON.parse(await r.text())
  } finally {
    clearTimeout(timer)
  }
}

export async function getParking() {
  const key = process.env.OLPARK_PARKING_KEY || PARKING_PUBLIC_KEY
  try {
    const data = await getJson(`${PARKING_URL}?apiKey=${encodeURIComponent(key)}`)
    const sum = Number(Array.isArray(data) ? data[0]?.parking_sum : data?.parking_sum)
    if (!Number.isFinite(sum) || sum < 0) throw new Error('unexpected response')
    // 기준치: 실시간 값에는 출차 기록이 없는 장기주차가 계속 쌓여 있어(기관 설명), 차량이 거의 없는 새벽에도 1,000대 이상으로 나온다.
    // 2026-11-19 01~02시에 1,094~1,099대로 측정됐고, 같은 시각 과거 평균(약 37대)을 빼서 1,060대를 기준치로 둔다.
    // 값이 달라지면 OLPARK_LIVE_BASELINE 환경변수로 바꾼다.
    const baseline = Number(process.env.OLPARK_LIVE_BASELINE ?? 1060)
    return { ok: true, parkingSum: sum, baseline, fetchedAt: new Date().toISOString(), source: '한국체육산업개발 올림픽공원 실시간 주차현황' }
  } catch (e) {
    return { ok: false, reason: 'upstream', message: String(e?.message || e).slice(0, 120) }
  }
}

function kcisaItems(data) {
  const items = data?.response?.body?.items?.item
  return Array.isArray(items) ? items : items ? [items] : []
}

// API마다 키가 따로 발급되면 전용 변수(KCISA_KEY_SHOWS 등)를, 하나로 같이 쓰면 KCISA_SERVICE_KEY 를 넣는다.
async function kcisa(url, numOfRows, pageNo = 1, keyName = '') {
  const key = (keyName && process.env[keyName]) || process.env.KCISA_SERVICE_KEY
  if (!key) return { ok: false, reason: 'no-key' }
  try {
    const data = await getJson(`${url}?serviceKey=${encodeURIComponent(key)}&numOfRows=${numOfRows}&pageNo=${pageNo}`, 15000)
    return { ok: true, items: kcisaItems(data), total: Number(data?.response?.body?.totalCount) || null }
  } catch (e) {
    return { ok: false, reason: 'upstream', message: String(e?.message || e).slice(0, 120) }
  }
}

// 공연정보: 필드 구성이 기관 메타데이터 형식이라 그대로 전달하고, 화면에서 필요한 것만 고른다.
export async function getShows() {
  const r = await kcisa(KCISA.shows, 50, 1, 'KCISA_KEY_SHOWS')
  if (!r.ok) return r
  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    source: '한국체육산업개발 올림픽공원 공연정보 (문화공공데이터광장)',
    shows: r.items.map((i) => ({
      title: String(i.title ?? '').trim(),
      period: String(i.temporalCoverage ?? '').trim(),
      place: String(i.spatial ?? '').trim(),
      time: String(i.extent ?? '').trim(),
      description: String(i.description ?? '').trim().slice(0, 300),
      id: String(i.uci ?? ''),
    })),
  }
}

// 연계 데이터: DESCRIPTION 이 "주차대수:19,방문객:57, 기온:-3.4, ... 공연명:,공연관람객수:0" 형태의 글자라서 풀어서 돌려준다.
export function parseLinked(item) {
  const out = {}
  for (const part of String(item.DESCRIPTION ?? item.description ?? '').split(',')) {
    const i = part.indexOf(':')
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  const num = (v) => (v === undefined || v === '' ? null : Number(v))
  return {
    at: String(item.ISSUED_DATE ?? item.issuedDate ?? ''),
    cars: num(out['주차대수']),
    visitors: num(out['방문객']),
    temp: num(out['기온']),
    rain: num(out['강수량']),
    holiday: out['휴일'] || '',
    show: out['공연명'] || '',
    audience: num(out['공연관람객수']),
  }
}

export async function getLinked(pageNo = 1) {
  const r = await kcisa(KCISA.linked, 1000, pageNo, 'KCISA_KEY_LINKED')
  if (!r.ok) return r
  return { ok: true, total: r.total, source: '한국체육산업개발 올림픽공원 2025 차량입출차·공연·날씨 연계 데이터', rows: r.items.map(parseLinked) }
}

// ───────── 길찾기: 카카오맵 REST API ─────────
// 앱 키는 KAKAO_REST_KEY 환경변수에만 둔다 (코드·화면·로그에 내지 않는다).
// 무료 제공량(일 대중교통 경로 조회 1,000건, 키워드 장소 검색 100,000건)만 쓴다. 비즈월렛(결제 수단)은 연결하지 않는다.
// 제공량을 다 쓰면 HTTP 400 + 에러 코드 -10 이 오고, 요금이 나가지 않는다.
// 카카오 이용 정책상 응답을 저장·재사용(캐시)하지 않는다. 호출 때마다 새로 받는다.
const KAKAO = {
  transit: 'https://dapi.kakao.com/v2/routing/publictraffic',
  keyword: 'https://dapi.kakao.com/v2/local/search/keyword.json',
}

async function kakaoGet(url, params) {
  const key = process.env.KAKAO_REST_KEY
  if (!key) return { ok: false, reason: 'no-key' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const r = await fetch(`${url}?${new URLSearchParams(params)}`, { signal: ctrl.signal, headers: { Authorization: `KakaoAK ${key}`, accept: 'application/json' } })
    const text = await r.text()
    let body = null
    try {
      body = JSON.parse(text)
    } catch {
      // 본문이 JSON 이 아니면 아래에서 upstream 으로 처리
    }
    if (r.ok) return { ok: true, body }
    // 무료 제공량 소진: HTTP 400, code -10
    if (r.status === 400 && body?.code === -10) return { ok: false, reason: 'quota' }
    if (r.status === 401 || r.status === 403) return { ok: false, reason: 'auth' }
    return { ok: false, reason: 'upstream', message: `HTTP ${r.status}` }
  } catch (e) {
    return { ok: false, reason: 'upstream', message: String(e?.name === 'AbortError' ? 'timeout' : e?.message || e).slice(0, 80) }
  } finally {
    clearTimeout(timer)
  }
}

const inKorea = (x, y) => Number.isFinite(x) && Number.isFinite(y) && x >= 124 && x <= 132 && y >= 33 && y <= 39

/** 장소 이름으로 좌표 찾기 (키워드 검색). 후보 5곳까지 */
export async function searchPlace(query) {
  const q = String(query ?? '').trim().slice(0, 40)
  if (q.length < 2) return { ok: false, reason: 'bad-request' }
  const r = await kakaoGet(KAKAO.keyword, { query: q, size: '5' })
  if (!r.ok) return r
  const docs = Array.isArray(r.body?.documents) ? r.body.documents : []
  return {
    ok: true,
    places: docs
      .map((d) => ({ name: String(d.place_name ?? ''), address: String(d.road_address_name || d.address_name || ''), x: Number(d.x), y: Number(d.y) }))
      .filter((p) => p.name && inKorea(p.x, p.y)),
  }
}

// 초 → 분 (1분 미만은 1분)
const minutes = (sec) => Math.max(1, Math.round(Number(sec) / 60))

function shapeStep(s) {
  const p = s?.properties ?? {}
  const vehicles = Array.isArray(p.vehicles) ? p.vehicles : []
  const stops = Array.isArray(p.stops) ? p.stops.map((v) => String(v?.name ?? '')).filter(Boolean) : []
  return {
    type: p.type === 'BUS' || p.type === 'SUBWAY' ? p.type : 'WALKING',
    minutes: Number.isFinite(Number(p.time)) ? minutes(p.time) : null,
    // "마을 76 (판교역동편 > 성남시청전면)" 같은 안내 문구를 그대로 쓴다
    guidance: String(p.guidance ?? '').trim(),
    // 버스 번호·노선 이름 (문서에 지하철 호선 필드가 따로 없어, 있으면 쓰고 없으면 안내 문구를 쓴다)
    lines: vehicles.map((v) => [v?.type, v?.name].filter(Boolean).join(' ')).filter(Boolean),
    from: stops[0] ?? '',
    to: stops.length > 1 ? stops[stops.length - 1] : '',
    stopCount: stops.length > 1 ? stops.length - 1 : null,
  }
}

/** 출발지→도착지 대중교통 경로. 좌표는 경도(x)·위도(y). 승하차 지점 사이만 안내하고, 출발지→첫 승차·마지막 하차→도착지 도보는 포함하지 않는다 */
export async function getTransit({ sx, sy, ex, ey }) {
  const [a, b, c, d] = [sx, sy, ex, ey].map(Number)
  if (!inKorea(a, b) || !inKorea(c, d)) return { ok: false, reason: 'bad-request' }
  const r = await kakaoGet(KAKAO.transit, { start_x: String(a), start_y: String(b), end_x: String(c), end_y: String(d), s_name: '출발', e_name: '도착' })
  if (!r.ok) return r
  const status = r.body?.status
  if (status !== 'OK') return { ok: false, reason: status === 'EQUAL_POINTS' ? 'same-place' : 'no-route', status: String(status ?? '') }
  const routes = (Array.isArray(r.body?.routes) ? r.body.routes : []).slice(0, 3).map((rt) => {
    const p = rt?.properties ?? {}
    return {
      type: String(p.type ?? ''),
      minutes: minutes(p.totalTime),
      transfers: Number.isFinite(Number(p.transfers)) ? Number(p.transfers) : null,
      fare: Number.isFinite(Number(p.fare?.value)) ? Number(p.fare.value) : null,
      steps: (Array.isArray(rt?.steps) ? rt.steps : []).map(shapeStep),
    }
  })
  return routes.length ? { ok: true, routes, fetchedAt: new Date().toISOString(), source: '카카오맵 대중교통 경로 조회' } : { ok: false, reason: 'no-route' }
}
