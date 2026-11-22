import { useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { busStopsFor, stationsFor } from './data'
import { KakaoRouteButton, venuePlace } from './kakao'
import type { Place } from './kakao'
import { BusStopList, StationList } from './stops'
import { RealTag } from './ui'

// 앱 안 대중교통 길찾기: 출발지·도착지를 정하면 걸리는 시간과 탈 버스 번호·지하철을 보여준다.
// 데이터는 서버 함수(/api/transit, /api/place)가 카카오맵 REST API 로 가져온다. 키는 서버 환경변수에만 있다.

type Found = { name: string; address: string; x: number; y: number }
type Step = { type: 'BUS' | 'SUBWAY' | 'WALKING'; minutes: number | null; guidance: string; lines: string[]; from: string; to: string; stopCount: number | null }
type Route = { type: string; minutes: number; transfers: number | null; fare: number | null; steps: Step[] }
type Failure = 'no-key' | 'quota' | 'auth' | 'no-route' | 'same-place' | 'upstream' | 'bad-request' | 'network' | 'no-location'

const FAIL_TEXT: Record<Failure, string> = {
  'no-location': '내 위치를 가져오지 못했어요. 출발지를 검색해서 정해 주세요.',
  'no-key': '앱 안 길찾기는 아직 연결 중이에요.',
  quota: '오늘 조회 가능한 횟수를 모두 썼어요.',
  auth: '길찾기 연결 설정을 확인하고 있어요.',
  'no-route': '이 출발지와 도착지 사이의 대중교통 경로를 찾지 못했어요.',
  'same-place': '출발지와 도착지가 같아요.',
  upstream: '길찾기 정보를 가져오지 못했어요. 잠시 뒤 다시 해 주세요.',
  'bad-request': '출발지나 도착지를 다시 정해 주세요.',
  network: '인터넷 연결을 확인해 주세요.',
}

async function api<T>(path: string): Promise<({ ok: true } & T) | { ok: false; reason: Failure }> {
  try {
    const r = await fetch(path)
    const j = await r.json()
    if (j?.ok) return j
    // 서버가 처음 보는 사유를 주더라도 안내 문구가 비지 않게 한다
    return { ok: false, reason: typeof j?.reason === 'string' && j.reason in FAIL_TEXT ? (j.reason as Failure) : 'upstream' }
  } catch {
    return { ok: false, reason: 'network' }
  }
}

const toPlace = (f: Found): Place => ({ name: f.name, lat: f.y, lng: f.x })

/** 장소 이름으로 찾아서 고른다. extra: 입력칸 옆에 둘 보조 버튼 (내 위치, 공연장) */
function PlacePick({ label, value, onChange, onError, extra }: { label: string; value: Place | null; onChange: (p: Place | null) => void; onError: (f: Failure) => void; extra?: ReactNode }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [found, setFound] = useState<Found[] | null>(null)

  const search = async (e: FormEvent) => {
    e.preventDefault()
    if (q.trim().length < 2) return
    setBusy(true)
    const r = await api<{ places: Found[] }>(`/api/place?q=${encodeURIComponent(q.trim())}`)
    setBusy(false)
    if (!r.ok) return onError(r.reason)
    setFound(r.places)
  }

  if (value) {
    return (
      <div className="place-pick">
        <span className="place-label">{label}</span>
        <div className="place-chosen">
          <b>{value.name}</b>
          <button type="button" className="link back-btn" onClick={() => { onChange(null); setFound(null) }}>
            바꾸기
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="place-pick">
      <span className="place-label">{label}</span>
      <form className="place-search" onSubmit={search}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="장소나 역 이름 (예: 강남역)" aria-label={`${label} 검색`} maxLength={40} />
        <button type="submit" className="btn btn-outline" disabled={busy || q.trim().length < 2}>
          {busy ? '찾는 중…' : '검색'}
        </button>
      </form>
      {extra && <div className="place-extra">{extra}</div>}
      {found && (
        <ul className="place-results" aria-label={`${label} 검색 결과`}>
          {found.length === 0 && <li className="muted small">검색 결과가 없어요. 다른 이름으로 찾아보세요.</li>}
          {found.map((f) => (
            <li key={`${f.x},${f.y}`}>
              <button type="button" onClick={() => { onChange(toPlace(f)); setFound(null) }}>
                <b>{f.name}</b>
                <span className="muted small">{f.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const STEP_ICON = { BUS: '🚌', SUBWAY: '🚇', WALKING: '🚶' } as const

/** 안내 문구에 버스 번호·호선이 이미 들어 있으면, 배지와 겹치지 않게 그 부분을 뺀다 ("2호선 (강남 > 잠실)" → "(강남 > 잠실)") */
function withoutLine(guidance: string, line: string | undefined): string {
  if (!line) return guidance
  // 버스는 "지선 3413외 1대 (타는곳 > 내리는곳)" 꼴이라, 번호는 배지에 있으니 괄호 안만 남긴다
  const paren = guidance.indexOf('(')
  if (/\d외 \d+대/.test(guidance) && paren > 0) return guidance.slice(paren)
  for (const key of [line, line.split(' ').pop() ?? '']) {
    if (key && guidance.includes(key)) return guidance.replace(key, '').trim()
  }
  return guidance
}

/** 카카오가 붙이는 종류 접두어("일반 2호선", "지선 3413")를 떼고, 버스는 번호만 최대 3개 보여준다 */
function lineLabel(s: Step): string {
  const names = s.lines.map((l) => (s.type === 'BUS' ? (l.split(' ').pop() ?? l) : l.replace(/^일반\s+/, '')))
  return [...new Set(names)].slice(0, 3).join(' · ')
}

/** 경로를 "🚇 2호선 → 🚌 3412" 한 줄로 줄인다 */
function routeSummary(r: Route): string {
  const parts = r.steps.filter((s) => s.type !== 'WALKING').map((s) => `${STEP_ICON[s.type]} ${lineLabel(s) || (s.type === 'BUS' ? '버스' : '지하철')}`)
  return parts.length ? parts.join(' → ') : '🚶 걸어서'
}

/** 공연장 근처에서 탈 수 있는 지하철 호선과 정류장 수 (검색 전에도 보이는 안내) */
function Available({ venue }: { venue: string }) {
  const lines = [...new Set(stationsFor(venue).flatMap((s) => s.lines.replace('호선', '').split('·')))].sort((a, b) => Number(a) - Number(b))
  const stops = busStopsFor(venue).length
  return (
    <p className="small avail">
      🚇 지하철 <b>{lines.map((l) => `${l}호선`).join(' · ')}</b> · 🚌 버스 정류장 <b>{stops}곳</b>
      <span className="muted"> — 출발지를 정하면 어떤 호선과 몇 번 버스를 타면 되는지 알려드려요.</span>
    </p>
  )
}

function RouteCard({ r, rank }: { r: Route; rank: number }) {
  return (
    <article className="route-card">
      <div className="route-head">
        <b className="route-min">
          {rank === 0 && <span className="tag tag-real">가장 빨라요</span>} 약 {r.minutes}분
        </b>
        <span className="muted small">
          {r.transfers != null && `환승 ${r.transfers}회`}
          {r.fare != null && ` · ${r.fare.toLocaleString()}원`}
        </span>
      </div>
      <ol className="route-steps">
        {r.steps.map((s, i) => (
          <li key={i} className={'rs-' + s.type.toLowerCase()}>
            <span className="rs-ico" aria-hidden>
              {STEP_ICON[s.type]}
            </span>
            <span className="rs-text">
              {s.type === 'WALKING' ? (
                <>걷기{s.minutes != null && ` ${s.minutes}분`}</>
              ) : (
                <>
                  {lineLabel(s) && <b className="rs-line">{lineLabel(s)}</b>} {withoutLine(s.guidance, s.lines[0]) || (s.from && s.to ? `${s.from} → ${s.to}` : '')}
                  <span className="muted small">
                    {s.minutes != null && ` · ${s.minutes}분`}
                    {s.stopCount != null && ` · ${s.stopCount}정거장`}
                  </span>
                </>
              )}
            </span>
          </li>
        ))}
      </ol>
    </article>
  )
}

/** 출발지(내 위치 또는 검색)와 도착지(기본은 공연장)를 정하면 대중교통 경로를 보여준다 */
export function RouteFinder({ venue }: { venue: string }) {
  const venuePl = venuePlace(venue)
  const [from, setFrom] = useState<Place | null>(null)
  const [to, setTo] = useState<Place | null>(venuePl)
  const [busy, setBusy] = useState(false)
  const [routes, setRoutes] = useState<Route[] | null>(null)
  const [fail, setFail] = useState<Failure | null>(null)
  const [locating, setLocating] = useState(false)
  const [toWalk, setToWalk] = useState<number | null>(null) // 목록에서 고른 역·정류장에서 공연장까지 걷는 분(추정)
  const out = useRef<HTMLDivElement>(null)

  /** 내 위치 한 번 조회. 못 가져오면 null */
  const whereAmI = (): Promise<Place | null> =>
    new Promise((resolve) => {
      if (!('geolocation' in navigator)) return resolve(null)
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ name: '내 위치', lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 8000, maximumAge: 60000 },
      )
    })

  const useMyLocation = async () => {
    setLocating(true)
    const me = await whereAmI()
    setLocating(false)
    if (me) {
      setFail(null)
      setFrom(me)
    } else setFail('no-location')
    return me
  }

  const run = async (f: Place, t: Place) => {
    setBusy(true)
    setFail(null)
    setRoutes(null)
    const r = await api<{ routes: Route[] }>(`/api/transit?sx=${f.lng}&sy=${f.lat}&ex=${t.lng}&ey=${t.lat}`)
    setBusy(false)
    if (r.ok) setRoutes(r.routes)
    else setFail(r.reason)
    // 결과가 화면 밖이면 보이는 곳까지 내려준다
    requestAnimationFrame(() => out.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }

  const go = () => {
    if (from && to) run(from, to)
  }

  /** 가까운 역·정류장을 눌렀을 때: 그곳을 도착지로 정하고 바로 길찾기. 출발지가 없으면 내 위치를 한 번 묻는다 */
  const pickStop = async (p: Place, walkMin: number) => {
    setTo(p)
    setToWalk(walkMin)
    setRoutes(null)
    const start = from ?? (await useMyLocation())
    if (start) await run(start, p)
  }

  // 길찾기를 못 하는 경우에도 막히지 않도록 카카오맵 앱으로 이어준다
  const canOpenKakao = fail === 'no-key' || fail === 'quota' || fail === 'auth' || fail === 'upstream' || fail === 'network' || fail === 'no-location'

  return (
    <div className="route-finder">
      <PlacePick
        label="출발"
        value={from}
        onChange={setFrom}
        onError={setFail}
        extra={
          <button type="button" className="btn btn-soft" onClick={useMyLocation} disabled={locating}>
            {locating ? '위치 확인 중…' : '📍 내 위치로'}
          </button>
        }
      />
      <PlacePick
        label="도착"
        value={to}
        onChange={(p) => {
          setTo(p)
          setToWalk(null)
        }}
        onError={setFail}
        extra={
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => {
              setTo(venuePl)
              setToWalk(null)
            }}
          >
            🎫 {venue}
          </button>
        }
      />
      <Available venue={venue} />
      {to && toWalk != null && (
        <p className="muted small">
          {to.name}에서 {venue}까지 걸어서 약 {toWalk}분이에요 (직선거리로 계산한 추정값).
        </p>
      )}

      <div className="stop-pick">
        <b className="stop-pick-title">가까운 역·정류장에서 내리기</b>
        <p className="muted small">누르면 그곳까지 길찾기를 해요. 출발지를 안 정했다면 내 위치를 한 번 물어봐요(저장하지 않아요).</p>
        <StationList venue={venue} onPick={pickStop} selected={to?.name} />
        <BusStopList venue={venue} onPick={pickStop} selected={to?.name} />
        <p className="muted small">역·정류장 위치는 지도 좌표예요. 서는 버스 노선은 정류장 번호로 지도 앱에서도 확인해 보세요.</p>
      </div>

      <button type="button" className="btn btn-primary" onClick={go} disabled={!from || !to || busy}>
        {busy ? '길을 찾는 중…' : from ? '이 경로로 길찾기' : '출발지를 정해 주세요'}
      </button>

      <div aria-live="polite" className="route-out" ref={out}>
        {fail && (
          <p className="info-bar small warn" role="status">
            {FAIL_TEXT[fail]}
          </p>
        )}
        {routes && (
          <>
            <div className="section-head">
              <b>대중교통 경로 {routes.length}개</b>
              <RealTag>카카오맵 실제 경로</RealTag>
            </div>
            <ul className="route-options" aria-label="탈 수 있는 대중교통 한눈에">
              {routes.map((r, i) => (
                <li key={i}>
                  <b>{i + 1}.</b> {routeSummary(r)} <span className="muted small">· 약 {r.minutes}분</span>
                </li>
              ))}
            </ul>
            {routes.map((r, i) => (
              <RouteCard key={i} r={r} rank={i} />
            ))}
            <p className="muted small">
              걸리는 시간과 요금은 조회한 시점의 값이에요. 출발지에서 첫 승차까지, 마지막 하차에서 도착지까지 걷는 시간은 경로마다 포함 여부가 달라, 자세한 도보 안내는 카카오맵에서 확인해 주세요. 공원 안 이동은 3D 지도의 역·정류장 표시를 보세요.
            </p>
          </>
        )}
      </div>

      {(canOpenKakao || routes) && from && to && (
        <KakaoRouteButton mode="traffic" from={from} to={to} primary={canOpenKakao}>
          카카오맵에서 {routes ? '자세히 보기' : '열기'}
        </KakaoRouteButton>
      )}
      {canOpenKakao && !from && (
        <KakaoRouteButton mode="traffic" to={to ?? venuePl} primary>
          카카오맵에서 {(to ?? venuePl).name}까지 길찾기
        </KakaoRouteButton>
      )}
    </div>
  )
}
