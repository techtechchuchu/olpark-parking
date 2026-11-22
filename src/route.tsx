import { useEffect, useRef, useState } from 'react'
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


/** 카카오가 붙이는 종류 접두어("일반", "급행", "지선")를 떼고 같은 이름은 하나로 합친다. 버스는 번호만 최대 3개 */
function lineLabel(s: Step): string {
  const names = s.lines.map((l) => (s.type === 'BUS' ? (l.split(' ').pop() ?? l) : l.replace(/^(일반|급행)\s+/, '')))
  return [...new Set(names)].slice(0, 3).join(' · ')
}

// 서울 지하철 노선색. 못 찾으면 지하철은 초록, 버스는 파랑
const LINE_COLORS: [RegExp, string][] = [
  [/^1호선/, '#0052A4'], [/^2호선/, '#00A84D'], [/^3호선/, '#EF7C1C'], [/^4호선/, '#00A5DE'], [/^5호선/, '#996CAC'],
  [/^6호선/, '#CD7C2F'], [/^7호선/, '#747F00'], [/^8호선/, '#E6186C'], [/^9호선/, '#AA9872'],
  [/^신분당/, '#D4003B'], [/^수인분당|^분당/, '#E6A800'], [/^경의중앙/, '#2A9D76'], [/^공항/, '#0090D2'], [/^경춘/, '#0C8E72'],
]
function lineColor(s: Step, label: string): string {
  if (s.type === 'BUS') return '#2E6FD8'
  return LINE_COLORS.find(([re]) => re.test(label))?.[1] ?? '#00714b'
}

/** 호선·버스 번호를 색 배지로 */
function LineChip({ s }: { s: Step }) {
  const label = lineLabel(s) || (s.type === 'BUS' ? '버스' : '지하철')
  return (
    <b className="rs-line" style={{ background: lineColor(s, label) }}>
      {s.type === 'BUS' && '🚌 '}
      {label}
    </b>
  )
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

/** 경로 한 개. 제목 줄(시간·탈 것)만 먼저 보이고, 누르면 어디서 타고 어디서 내리는지 나온다. walkMin: 내린 뒤 공연장까지 걷는 분(알 때만) */
function RouteCard({ r, rank, walkMin }: { r: Route; rank: number; walkMin: number | null }) {
  const rides = r.steps.filter((s) => s.type !== 'WALKING')
  const total = r.minutes + (walkMin ?? 0)
  return (
    <details className="route-card" open={rank === 0}>
      <summary>
        <div className="route-head">
          <b className="route-min">
            {walkMin != null ? '공연장까지 ' : ''}약 {total}분{rank === 0 && <span className="tag tag-real">가장 빨라요</span>}
          </b>
          <span className="muted small">
            {r.transfers ? `환승 ${r.transfers}회` : '환승 없음'}
            {r.fare != null && ` · ${r.fare.toLocaleString()}원`}
          </span>
        </div>
        <div className="route-chips">
          {rides.length === 0 && <span className="muted small">걸어서 갈 수 있어요</span>}
          {rides.map((s, i) => (
            <span key={i} className="chip-wrap">
              {i > 0 && <span className="arrow" aria-hidden>→</span>}
              <LineChip s={s} />
            </span>
          ))}
        </div>
      </summary>
      <ol className="route-steps">
        {rides.map((s, i) => (
          <li key={i}>
            <LineChip s={s} />
            <span>
              <b>{s.from}</b>에서 타서 <b>{s.to}</b>에서 내려요
              {s.stopCount != null && <span className="muted small"> · {s.stopCount}정거장</span>}
            </span>
          </li>
        ))}
        {walkMin != null && (
          <li className="rs-walk">
            <span className="rs-line rs-walkchip">🚶 도보</span>
            <span>내린 뒤 공연장까지 걸어서 약 {walkMin}분 <span className="muted small">(추정)</span></span>
          </li>
        )}
      </ol>
    </details>
  )
}

/**
 * 출발지(내 위치 또는 검색)와 도착지(기본은 공연장)를 정하면 대중교통 경로를 보여준다.
 * dest: 도착지를 밖에서 정해 줄 때 (자전거 대여소 화면). 그곳까지 바로 길찾기를 시작하고, 역·정류장 목록은 숨긴다.
 */
export function RouteFinder({ venue, dest }: { venue: string; dest?: { place: Place; walkMin: number } }) {
  const venuePl = venuePlace(venue)
  const [from, setFrom] = useState<Place | null>(null)
  const [to, setTo] = useState<Place | null>(dest?.place ?? venuePl)
  const [busy, setBusy] = useState(false)
  const [routes, setRoutes] = useState<Route[] | null>(null)
  const [fail, setFail] = useState<Failure | null>(null)
  const [locating, setLocating] = useState(false)
  const [toWalk, setToWalk] = useState<number | null>(dest?.walkMin ?? null) // 목록에서 고른 역·정류장에서 공연장까지 걷는 분(추정)
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
    // 걸리는 시간이 짧은 순서로 보여줘야 첫 번째가 "가장 빨라요"가 된다
    if (r.ok) setRoutes([...r.routes].sort((a, b) => a.minutes - b.minutes))
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

  // 밖에서 도착지를 정해 준 경우: 화면이 뜨자마자 한 번만 길찾기를 시작한다
  const started = useRef(false)
  useEffect(() => {
    if (!dest || started.current) return
    started.current = true
    pickStop(dest.place, dest.walkMin)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          setRoutes(null)
        }}
        onError={setFail}
        extra={
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => {
              setTo(venuePl)
              setToWalk(null)
              setRoutes(null)
            }}
          >
            🎫 {venue}
          </button>
        }
      />
      {!dest && <Available venue={venue} />}
      {to && toWalk != null && (
        <p className="muted small">
          {to.name}에서 {venue}까지 걸어서 약 {toWalk}분이에요 (직선거리로 계산한 추정값).
        </p>
      )}

      {!dest && (
        <div className="stop-pick">
          <b className="stop-pick-title">가까운 역·정류장에서 내리기</b>
          <p className="muted small">누르면 내 위치에서 그곳까지 길찾기를 해요 (위치는 저장하지 않아요).</p>
          <StationList venue={venue} onPick={pickStop} selected={to?.name} />
          <BusStopList venue={venue} onPick={pickStop} selected={to?.name} />
        </div>
      )}

      {(!routes || busy) && (
        <button type="button" className="btn btn-primary" onClick={go} disabled={!from || !to || busy}>
          {busy ? '길을 찾는 중…' : from ? '이 경로로 길찾기' : '출발지를 정해 주세요'}
        </button>
      )}

      <div aria-live="polite" className="route-out" ref={out}>
        {fail && (
          <p className="info-bar small warn" role="status">
            {FAIL_TEXT[fail]}
          </p>
        )}
        {routes && (
          <>
            <div className="section-head">
              <b>이렇게 가면 돼요</b>
              <RealTag>카카오맵 실제 경로</RealTag>
            </div>
            {routes.map((r, i) => (
              <RouteCard key={i} r={r} rank={i} walkMin={toWalk} />
            ))}
            <p className="muted small">조회한 시점의 시간·요금이에요. 집에서 첫 승차까지 걷는 시간은 카카오맵에서 확인해 주세요.</p>
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
