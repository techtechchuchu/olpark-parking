import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LOTS, NEED_LABEL, lotsFor, needCount, showById } from '../data'
import type { Need } from '../data'
import { ForecastLine, ForecastPanel } from '../forecast'
import { zoneStats } from '../history'
import { LiveParkingBar } from '../live'
import { SlotMap, buildSlots, canPick } from '../slots'
import { ReservePolicy, Ticket } from '../ticket'
import { HOLD_MS, LEVEL_LABEL, activeQueue, checkContact, formatClock, formatWhen, isActive, joinQueue, reservedAtOf, level, remaining, setTrip, useApp, waitRange } from '../store'
import { DemoTag, RealTag, Stepper, UNITY_PAGE } from '../ui'

// 공연 장소 이름 -> 3D 지도 안의 건물 이름
const VENUE_3D: Record<string, string> = {
  'KSPO DOME': 'KSPO DOME',
  올림픽홀: '올림픽홀',
  '올림픽공원 야외무대': '88잔디마당 야외무대',
}
const key3d = (l: { osm: string; id: string }) => l.osm || 'pin-' + l.id

/** 장애인·임산부 주차 안내. 할인과 휠체어 진입로는 올림픽공원 공식 주차 안내 내용이다 */
function AccessInfo({ need }: { need: Need }) {
  return (
    <ul className="info-list small access-info">
      {need === 'disabled' ? (
        <>
          <li>장애인 차량은 주차요금 50% 할인 (공식 안내) · 장애인 주차표지를 부착한 차량만 전용면을 이용할 수 있어요.</li>
          <li>만남의광장 휠체어 진입로: 동2문 입차 → 그래피티의 벽 주차장 → 올림픽공원역 쪽 경사로 (공식 안내)</li>
        </>
      ) : (
        <li>임산부 배려 주차면은 임산부 자동차 표지를 부착하고 임산부가 탑승한 차량을 위한 자리예요.</li>
      )}
      <li>주차장별 전용면 수는 공식 수치를 확인하지 못해 설치 비율로 잡은 예시 값이에요. 현장 표지를 따라 주세요.</li>
    </ul>
  )
}

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
  const [slot, setSlot] = useState<string | null>(null) // 배치도에서 고른 자리

  useEffect(() => {
    // SPA 대체 응답(index.html)과 구분하기 위해 Unity 빌드 표식을 확인
    fetch(UNITY_PAGE)
      .then((r) => (r.ok ? r.text() : ''))
      .then((t) => setState(t.includes('unity-canvas') ? 'ready' : 'missing'))
      .catch(() => setState('missing'))
  }, [])

  const show = showById(app.trip.showId)
  const need: Need = app.trip.need ?? 'none'
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
    setSlot(null)
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
    setError('error' in c ? c.error : joinQueue(sel.lot.id, c.phone, c.vehicle, app.trip.arrive, need, slot ?? undefined))
  }

  // 고른 주차장의 주차면 배치도 (예시). 고른 자리가 그 사이 찼거나 조건에 안 맞게 되면 선택을 푼다.
  const slots = sel ? buildSlots(sel.lot.id, sel.st.total, sel.st.occupied + sel.st.temp, sel.lot.accessible, sel.lot.family) : []
  const slotOk = slot ? slots.some((s) => s.label === slot && canPick(s, need)) : false

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
          <fieldset className="need">
            <legend>필요한 주차면이 있나요?</legend>
            <div className="chips">
              {(Object.keys(NEED_LABEL) as Need[]).map((n) => (
                <button key={n} type="button" className={'chip' + (need === n ? ' on' : '')} aria-pressed={need === n} onClick={() => setTrip({ ...app.trip, need: n })}>
                  {n === 'disabled' ? '♿ ' : n === 'pregnant' ? '🤰 ' : ''}
                  {NEED_LABEL[n]}
                </button>
              ))}
            </div>
            {need !== 'none' && <AccessInfo need={need} />}
          </fieldset>
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
                    {need !== 'none' && (
                      <span className="small need-line">
                        {NEED_LABEL[need]} 주차면 {needCount(row.lot, need)}면 <span className="tag">예시</span>
                      </span>
                    )}
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

              {need !== 'none' && (
                <p className="small need-line">
                  {NEED_LABEL[need]} 주차면으로 예약해요 · 이 주차장 {needCount(sel.lot, need)}면 <span className="tag">예시</span>
                </p>
              )}
              {!ticket && <SlotMap slots={slots} need={need} value={slotOk ? slot : null} onChange={setSlot} />}
              {!ticket && (
                <p className="small slot-picked" role="status">
                  {slotOk ? (
                    <>
                      선택한 자리 <b className="accent">{slot}</b>
                    </>
                  ) : (
                    slots.some((s) => canPick(s, need)) ? '자리를 고르지 않으면 빈자리 중 한 곳으로 안내돼요.' : '자리가 나면 순서대로 호출해 드려요.'
                  )}
                </p>
              )}
              {ticket ? (
                <div className="reserve-done">
                  <b className="reserve-ok">예약이 접수됐어요</b>
                  <Ticket q={ticket} />
                  <Link to="/queue" className="btn btn-primary">
                    내 예약 보기 →
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
                  <p className="reserve-when">
                    예약 시간 <b>{formatWhen(reservedAtOf(app.trip.date, app.trip.arrive))}</b>
                    <span className="muted small"> · {formatClock(reservedAtOf(app.trip.date, app.trip.arrive) + HOLD_MS)}까지 자리 유지</span>
                  </p>
                  <ReservePolicy />
                  {error && <p className="error small">{error}</p>}
                  <button className="btn btn-primary" type="submit">
                    이 시간으로 예약하기
                  </button>
                  <p className="muted small">로그인 없이 전화번호와 차량번호만으로 예약해요. 입력한 번호는 이 기기의 브라우저에만 저장되고 서버로 보내지 않습니다. 시연용이라 실제 주차 공간을 확보해 주지는 않아요.</p>
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
