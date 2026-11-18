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
