import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LOTS, lotsFor, showById } from '../data'
import { ForecastLine, ForecastPanel } from '../forecast'
import { zoneStats } from '../history'
import { LiveParkingBar } from '../live'
import { LEVEL_LABEL, STATUS_LABEL, activeQueue, checkContact, isActive, joinQueue, level, remaining, setTrip, useApp, waitRange } from '../store'
import { DemoTag, RealTag, Stepper, UNITY_PAGE } from '../ui'

// 공연 장소 이름 -> 3D 지도 안의 건물 이름
const VENUE_3D: Record<string, string> = {
  'KSPO DOME': 'KSPO DOME',
  올림픽홀: '올림픽홀',
  '올림픽공원 야외무대': '88잔디마당 야외무대',
}
const key3d = (l: { osm: string; id: string }) => l.osm || 'pin-' + l.id

/**
 * 2단계(도착 시각·혼잡 예측) → 3단계(지도에서 주차장 고르기) → 4단계(예약)를 한 화면에서 이어서 진행한다.
 * 3D 지도는 2단계를 보는 동안 화면 밖에서 자동으로 미리 불러오고, 3단계에서 같은 지도를 그대로 보여준다.
 */
export default function Map3D() {
  const app = useApp()
  const [params, setParams] = useSearchParams()
  const phase: 'when' | 'map' = params.get('view') === 'map' ? 'map' : 'when'
  const frame = useRef<HTMLIFrameElement>(null)
  const [state, setState] = useState<'checking' | 'ready' | 'missing'>('checking')
  const [mapLoaded, setMapLoaded] = useState(false) // Unity 씬이 떠서 조작 가능한 상태
  const [picked, setPicked] = useState<string | null>(null) // 고른 주차장 → 예약 단계
  const [phone, setPhone] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // SPA 대체 응답(index.html)과 구분하기 위해 Unity 빌드 표식을 확인
    fetch(UNITY_PAGE)
      .then((r) => (r.ok ? r.text() : ''))
      .then((t) => setState(t.includes('unity-canvas') ? 'ready' : 'missing'))
      .catch(() => setState('missing'))
  }, [])

  const show = showById(app.trip.showId)
  const rows = lotsFor(show.venue).map((l) => {
    const st = app.lots[l.id]
    const ahead = activeQueue(app, l.id).length
    return { lot: l, st, ahead, wait: waitRange(st, ahead), lv: level(st), zone: zoneStats(l.zone) }
  })

  // 추천 3곳: 가까운 곳 / 과거에 덜 붐빈 곳(실제 기록) / 지금 자리가 많은 곳(예시 현황)
  const near = [...rows].sort((a, b) => a.lot.walkMin - b.lot.walkMin)[0]
  const calm = [...rows].filter((r) => r !== near && r.zone).sort((a, b) => a.zone!.fullRatio - b.zone!.fullRatio || a.lot.walkMin - b.lot.walkMin)[0]
  const roomy = [...rows].filter((r) => r !== near && r !== calm).sort((a, b) => remaining(b.st) - remaining(a.st) || a.lot.walkMin - b.lot.walkMin)[0]
  const options = [
    { row: near, reason: '가장 가까운 곳', real: false },
    { row: calm, reason: '과거에 덜 붐빈 곳', real: true },
    { row: roomy, reason: '지금 자리가 많은 곳', real: false },
  ].filter((o) => o.row)

  const sel = phase === 'map' && picked ? rows.find((r) => r.lot.id === picked) : undefined
  const focus = sel ?? near // 지도 안내선의 출발 주차장
  const ticket = sel ? app.queue.find((q) => q.mine && q.lotId === sel.lot.id && isActive(q)) : undefined

  // 주차 현황을 Unity 씬으로 전달 (unity/index.html 이 받아서 SendMessage 로 넘김)
  const payload = JSON.stringify({
    venue: VENUE_3D[show.venue] ?? '',
    best: key3d(focus.lot),
    lots: rows.map((r) => ({ osm: key3d(r.lot), name: r.lot.zone, remaining: remaining(r.st), total: r.st.total, level: r.lv, x: r.lot.x, z: r.lot.z })),
  })

  const pick = (id: string | null) => {
    setPicked(id)
    setError(null)
  }

  useEffect(() => {
    if (state !== 'ready') return
    const send = () => frame.current?.contentWindow?.postMessage({ type: 'olpark-parking', payload }, window.location.origin)
    send()
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return
      if (e.data?.type === 'olpark-ready') {
        setMapLoaded(true)
        send()
      }
      if (e.data?.type === 'olpark-lot-click') {
        const lot = LOTS.find((l) => key3d(l) === e.data.osm)
        if (lot) pick(lot.id)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [state, payload])

  const reserve = (e: FormEvent) => {
    e.preventDefault()
    if (!sel) return
    const c = checkContact(phone, vehicle)
    setError('error' in c ? c.error : joinQueue(sel.lot.id, c.phone, c.vehicle, app.trip.arrive))
  }

  return (
    <div className="container section">
      <Stepper step={phase === 'when' ? 2 : sel ? 4 : 3} />

      <div className="trip-line">
        <div>
          <b>{show.title}</b>
          <span className="muted small">
            {' '}
            · {show.venue} · {show.time} 시작
          </span>
        </div>
        <Link to="/start" className="link">
          공연 바꾸기
        </Link>
      </div>

      {phase === 'when' && (
        <>
          <h1 className="page-title step-title">언제 도착하실 예정인가요?</h1>
          <div className="trip-edit">
            <label>
              <span>관람 날짜</span>
              <input type="date" value={app.trip.date} onChange={(e) => e.target.value && setTrip({ ...app.trip, date: e.target.value })} />
            </label>
            <label>
              <span>도착 예정시간</span>
              <input type="time" value={app.trip.arrive} onChange={(e) => e.target.value && setTrip({ ...app.trip, arrive: e.target.value })} />
            </label>
          </div>
          <ForecastPanel />
          <button type="button" className="btn btn-primary btn-wide" onClick={() => setParams({ view: 'map' })}>
            지도에서 주차장 고르기 →
          </button>
          <p className="muted small map-status" role="status">
            {state === 'missing' ? '3D 지도를 찾지 못했어요. 목록으로 비교할 수 있어요.' : mapLoaded ? '3D 지도 준비 완료' : '3D 지도를 미리 불러오는 중…'}
          </p>
          <LiveParkingBar />
        </>
      )}

      {/* 지도는 2단계에서는 보이지 않게 미리 띄워 두고, 3단계에서 같은 것을 그대로 보여준다 */}
      <div className={'unity-frame map-frame' + (phase === 'when' ? ' preload' : '')} aria-hidden={phase === 'when'}>
        {state === 'ready' && <iframe ref={frame} src={UNITY_PAGE} title="올림픽공원 3D 지도" allow="fullscreen" tabIndex={phase === 'when' ? -1 : 0} />}
        {state === 'checking' && <p className="muted">3D 화면을 확인하는 중…</p>}
        {state === 'missing' && (
          <div className="empty">
            <b>3D 빌드가 아직 없어요</b>
            <p className="muted small">Unity WebGL 빌드를 public/unity 폴더에 넣으면 이 자리에 표시됩니다.</p>
          </div>
        )}
      </div>

      {phase === 'map' && (
        <>
          <div className="legend">
            <span>
              <i className="dot lv-free" /> 여유
            </span>
            <span>
              <i className="dot lv-busy" /> 혼잡
            </span>
            <span>
              <i className="dot lv-full" /> 만차
            </span>
            <span className="muted">색은 예시 현황</span>
          </div>

          {!sel ? (
            <section className="step-panel" aria-live="polite">
              <div className="section-head">
                <h2>이 공연에는 여기를 추천해요</h2>
                <DemoTag>잔여면은 예시</DemoTag>
              </div>
              <div className="option-list">
                {options.map(({ row, reason, real }) => (
                  <button key={row.lot.id} type="button" className="option" onClick={() => pick(row.lot.id)}>
                    <span className="option-reason">
                      {reason} {real && <RealTag>실제 기록</RealTag>}
                    </span>
                    <span className="option-main">
                      <b>{row.lot.name}</b>
                      <span className={`badge lv-${row.lv}`}>잔여 {remaining(row.st)}면</span>
                    </span>
                    <span className="muted small">
                      {show.venue}까지 도보 약 {row.lot.walkMin}분 · 가능 {row.lot.capacity}대
                      {row.zone && ` · 과거 기록 만차 ${row.zone.fullRatio}%`}
                    </span>
                    <span className="go">여기로 예약하기 →</span>
                  </button>
                ))}
              </div>
              <p className="main-more">
                <Link to="/parking" className="btn btn-outline">
                  주차장 8곳 전체 비교하기 →
                </Link>
              </p>
            </section>
          ) : (
            <section className="step-panel reserve-card" aria-live="polite">
              <button type="button" className="link back-btn" onClick={() => pick(null)}>
                ← 다른 주차장 보기
              </button>
              <div className="lot-top">
                <b className="reserve-title">{sel.lot.name}</b>
                <span className={`badge lv-${sel.lv}`}>예시 · {LEVEL_LABEL[sel.lv]}</span>
              </div>
              <p className="muted small">
                {sel.lot.area} · 가능 {sel.lot.capacity}대 · {show.venue}까지 도보 약 {sel.lot.walkMin}분
                {sel.zone && ` · 과거 기록 만차 ${sel.zone.fullRatio}%`}
              </p>
              <div className="reserve-stats">
                <div>
                  <span className="muted small">예상 입차 대기</span>
                  <b className="accent">
                    {sel.wait[0]}–{sel.wait[1]}분
                  </b>
                </div>
                <div>
                  <span className="muted small">일반 잔여면</span>
                  <b>{remaining(sel.st)}면</b>
                </div>
                <div>
                  <span className="muted small">앞선 대기</span>
                  <b>{sel.ahead}대</b>
                </div>
              </div>

              {ticket ? (
                <div className="reserve-done">
                  <span className="muted small">예약이 접수됐어요 · 내 대기번호</span>
                  <b>{String(ticket.no).padStart(3, '0')}</b>
                  <span className={`badge st-${ticket.status}`}>{STATUS_LABEL[ticket.status]}</span>
                  <Link to="/queue" className="btn btn-primary">
                    내 대기 상태 보기 →
                  </Link>
                </div>
              ) : (
                <form className="reserve-form" onSubmit={reserve}>
                  <label>
                    <span>휴대전화 번호</span>
                    <input type="tel" inputMode="numeric" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-1234-5678" maxLength={13} required />
                  </label>
                  <label>
                    <span>차량번호</span>
                    <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="12가 3456" maxLength={9} required />
                  </label>
                  {error && <p className="error small">{error}</p>}
                  <button className="btn btn-primary" type="submit">
                    여기로 대기 예약하기
                  </button>
                  <p className="muted small">도착 예정 {app.trip.arrive} · 로그인 없이 전화번호와 차량번호만으로 예약해요. 입력한 번호는 이 기기의 브라우저에만 저장되고 서버로 보내지 않습니다. 시연용이라 실제 주차 공간을 확보해 주지는 않아요.</p>
                </form>
              )}
              <Link to={`/parking/${sel.lot.id}`} className="link">
                과거 패턴·요금 상세 보기 →
              </Link>
            </section>
          )}

          <div className="step-panel">
            <ForecastLine />
          </div>
          <p className="muted small map-credit">
            지도: 끌어서 이동 · +/− 확대/축소 · ⟲ ⟳ 회전 · 지도 데이터 ©{' '}
            <a className="link" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap
            </a>{' '}
            기여자 (ODbL) · 건물 높이는 추정값
          </p>
        </>
      )}
    </div>
  )
}
