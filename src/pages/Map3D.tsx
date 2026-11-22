import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BUS_STOPS, LOTS, NEED_LABEL, STATIONS, lotsFor, needCount, showById } from '../data'
import type { Need } from '../data'
import { ForecastLine, ForecastPanel, useForecast } from '../forecast'
import { KakaoRouteButton, placeAt } from '../kakao'
import { TravelAdvice } from '../transit'
import { analyze, zoneStats } from '../history'
import { LiveParkingBar } from '../live'
import { SlotMap, buildSlots, canPick } from '../slots'
import { ReservePolicy, Ticket } from '../ticket'
import { HOLD_MS, LEVEL_LABEL, MAX_STAY_MS, activeQueue, bookingWindow, checkContact, defaultLeave, fmtStay, formatClock, formatWhen, isActive, joinQueue, stayMin, reservedAtOf, verifiedNeed, level, remaining, setTrip, useApp, waitRange } from '../store'
import { DemoTag, RealTag, Stepper, UNITY_PAGE } from '../ui'

// 목적지 이름 -> 3D 지도 안의 건물 이름 (적지 않은 곳은 이름이 같다)
const VENUE_3D: Record<string, string> = {
  'KSPO DOME': 'KSPO DOME',
  올림픽홀: '올림픽홀',
  '올림픽공원 야외무대': '88잔디마당 야외무대',
  '88잔디마당': '88잔디마당 야외무대',
}
const key3d = (l: { osm: string; id: string }) => l.osm || 'pin-' + l.id

/** 장애인·임산부 주차 안내. 할인과 휠체어 진입로는 올림픽공원 공식 주차 안내 내용이다 */
/**
 * 전용 주차면 이용 자격 인증 (시연).
 * 실제 서비스에서는 표지 발급 기관의 정보와 대조해야 하지만, 연계된 기관이 없어 여기서는 표지 번호 형식과 동의만 확인한다.
 * 장애 여부는 민감한 정보라서 번호 전체는 저장하지 않고 끝 4자리만 이 기기에 남긴다.
 */
function VerifyNeed({ need }: { need: Need }) {
  const app = useApp()
  const [code, setCode] = useState('')
  const [agree, setAgree] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const proof = app.trip.needProof?.kind === need ? app.trip.needProof : null
  const docName = need === 'disabled' ? '장애인자동차표지' : '임산부 자동차 표지'

  if (proof) {
    return (
      <div className="verify done" role="status">
        <b>✓ 인증 완료</b> <span className="tag">시연</span>
        <span className="small">
          {docName} 끝자리 {proof.tail} · 전용면을 고를 수 있어요. 입차할 때 표지를 확인합니다.
        </span>
        <button type="button" className="link back-btn" onClick={() => setTrip({ ...app.trip, needProof: undefined })}>
          다시 인증하기
        </button>
      </div>
    )
  }

  const submit = () => {
    const v = code.replace(/[\s-]/g, '').toUpperCase()
    if (!/^[A-Z0-9가-힣]{6,20}$/.test(v)) return setError(`${docName}에 적힌 발급번호를 6자리 이상 입력해 주세요.`)
    if (!agree) return setError('안내를 확인하고 동의해 주세요.')
    setError(null)
    setCode('')
    setTrip({ ...app.trip, needProof: { kind: need, tail: v.slice(-4), at: Date.now() } })
  }

  return (
    <div className="verify">
      <b>{NEED_LABEL[need]} 주차면은 인증이 필요해요</b>
      <label>
        <span>{docName} 발급번호</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="표지에 적힌 번호" maxLength={24} autoComplete="off" />
      </label>
      <label className="check">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>
          본인(또는 동승자)이 대상자이며, 입차할 때 표지를 확인하는 데 동의합니다. 사실과 다르면 예약이 취소되고
          {need === 'disabled' ? ' 관련 법에 따라 과태료가 부과될 수 있습니다.' : ' 전용면을 이용할 수 없습니다.'}
        </span>
      </label>
      {error && <p className="error small">{error}</p>}
      <button type="button" className="btn btn-primary" onClick={submit}>
        인증하기
      </button>
      <p className="muted small">
        시연용 인증입니다. 번호 형식과 동의만 확인하며, 번호는 끝 4자리만 이 기기에 저장하고 서버로 보내지 않습니다. 실제 운영에서는 표지 발급 기관의 정보와 대조하는 절차가 필요합니다.
      </p>
    </div>
  )
}

/** 필요한 주차면 종류 고르기. 가는 방법이 아니라 주차장을 고르는 단계의 질문이라서 3단계에서 묻는다 */
/** 머무는 시간: 나갈 예정시간을 따로 받는다. 도착 시간(가는 방법)과는 별개의 구역이고, 예약할 때도 같은 값을 쓴다 */
function StayPicker({ pastStay }: { pastStay: number }) {
  const app = useApp()
  const leave = app.trip.leave ?? defaultLeave(app.trip.arrive)
  const stay = stayMin(app.trip.arrive, leave)
  return (
    <section className="stay-box" aria-label="머무는 시간">
      <b>머무는 시간</b>
      <label className="stay-input">
        <span>나갈 예정시간</span>
        <input type="time" value={leave} onChange={(e) => e.target.value && setTrip({ ...app.trip, leave: e.target.value })} />
      </label>
      {stay ? (
        <p className="small">
          {app.trip.arrive}에 도착해서 {leave}에 나가면 <b>약 {fmtStay(stay)}</b> 머물러요.{' '}
          <span className="muted">같은 요일 평균 체류는 {fmtStay(pastStay)}이에요 (2024년 7월 실제 기록).</span>
          {stay * 60000 > MAX_STAY_MS && <span className="stay-warn"> 예약 주차는 최대 {fmtStay(MAX_STAY_MS / 60000)}까지예요.</span>}
        </p>
      ) : (
        <p className="small stay-warn" role="alert">
          나가는 시간은 도착 시간({app.trip.arrive})보다 늦어야 해요.
        </p>
      )}
    </section>
  )
}

function NeedPicker({ chosen }: { chosen: Need }) {
  const app = useApp()
  return (
    <fieldset className="need" id="need-picker">
      <legend>필요한 주차면이 있나요?</legend>
      <div className="chips">
        {(Object.keys(NEED_LABEL) as Need[]).map((n) => (
          <button key={n} type="button" className={'chip' + (chosen === n ? ' on' : '')} aria-pressed={chosen === n} onClick={() => setTrip({ ...app.trip, need: n })}>
            {n === 'disabled' ? '♿ ' : n === 'pregnant' ? '🤰 ' : ''}
            {NEED_LABEL[n]}
          </button>
        ))}
      </div>
      {chosen !== 'none' && <VerifyNeed need={chosen} />}
      {chosen !== 'none' && <AccessInfo need={chosen} />}
    </fieldset>
  )
}

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
  const showResult = params.get('go') === '1' // 2단계에서 "확인하기"를 누른 뒤에만 결과를 보여준다
  const frame = useRef<HTMLIFrameElement>(null)
  const [state, setState] = useState<'checking' | 'ready' | 'missing'>('checking')
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
  const fc = useForecast()
  const win = bookingWindow(app.trip.date) // 이 날짜를 지금 예약할 수 있는지
  const when = reservedAtOf(app.trip.date, app.trip.arrive)
  const leave = app.trip.leave ?? defaultLeave(app.trip.arrive) // 나갈 예정 시각
  const stay = stayMin(app.trip.arrive, leave) // 체류 분 (나가는 시각이 도착보다 빠르면 null)
  const pastStay = analyze({ dow: 'same', hour: Number(app.trip.arrive.slice(0, 2)) || 17 }, app.trip.date).stayAvg // 같은 요일 평균 체류(분, 2024년 7월 실제 기록)
  const chosen: Need = app.trip.need ?? 'none' // 고른 주차면 종류
  const need: Need = verifiedNeed(app.trip) // 인증까지 끝나 실제로 적용되는 종류
  const rows = lotsFor(show.venue).map((l) => {
    const st = app.lots[l.id]
    const ahead = activeQueue(app, l.id).length
    return { lot: l, st, ahead, wait: waitRange(st, ahead), lv: level(st), zone: zoneStats(l.zone) }
  })

  // 추천 3곳: 가까운 곳 / 과거에 덜 붐빈 곳(실제 기록) / 지금 자리가 많은 곳(예시 현황)
  // 자리가 없는(잔여 0면) 곳은 추천하지 않는다. 모든 곳이 가득 찼을 때만 전체에서 고른다
  const open = rows.filter((r) => remaining(r.st) > 0)
  const allFull = open.length === 0
  const pool = allFull ? rows : open
  const near = [...pool].sort((a, b) => a.lot.walkMin - b.lot.walkMin)[0]
  const calm = [...pool].filter((r) => r !== near && r.zone).sort((a, b) => a.zone!.fullRatio - b.zone!.fullRatio || a.lot.walkMin - b.lot.walkMin)[0]
  const roomy = [...pool].filter((r) => r !== near && r !== calm).sort((a, b) => remaining(b.st) - remaining(a.st) || a.lot.walkMin - b.lot.walkMin)[0]
  const options = [
    { row: near, reason: allFull ? '가장 가까운 곳' : '자리 있는 곳 중 가장 가까운 곳', real: false },
    { row: calm, reason: '과거에 덜 붐빈 곳', real: true },
    { row: roomy, reason: '지금 자리가 많은 곳', real: false },
  ].filter((o) => o.row)

  const sel = phase === 'map' && picked ? rows.find((r) => r.lot.id === picked) : undefined
  const focus = sel ?? near // 지도 안내선의 출발 주차장
  const ticket = sel ? app.queue.find((q) => q.mine && q.lotId === sel.lot.id && isActive(q)) : undefined

  // 주차 현황을 Unity 씬으로 전달 (unity/index.html 이 받아서 SendMessage 로 넘김)
  const payload = JSON.stringify({
    venue: VENUE_3D[show.venue] ?? show.venue,
    best: key3d(focus.lot),
    stations: [...STATIONS.map((s) => ({ name: s.name, kind: 'subway', x: s.x, z: s.z })), ...BUS_STOPS.map((s) => ({ name: s.name, kind: 'bus', x: s.x, z: s.z }))],
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
        send() // Unity 씬이 떴으니 현황을 다시 보낸다
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
    setError('error' in c ? c.error : joinQueue(sel.lot.id, c.phone, c.vehicle, app.trip.arrive, need, slot ?? undefined, leave))
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
            · {show.visit ? show.genre : `${show.venue} · ${show.time} 시작`}
          </span>
        </div>
        <Link to="/start" className="link">
          목적지 바꾸기
        </Link>
      </div>

      {phase === 'when' && (
        <>
          {/* 1구역 · 머무는 시간: 날짜와 도착~나감 시각. 가는 방법과는 구역을 나눈다 */}
          {!showResult ? (
            <section className="when-box">
              <h1 className="page-title step-title">언제, 얼마나 머무르세요?</h1>
              <p className="muted small">날짜와 도착·나갈 시각을 정해 주세요. 그 시간의 혼잡을 보고 가는 방법을 알려드려요.</p>
              <div className="trip-edit">
                <label className="span-2">
                  <span>방문 날짜</span>
                  <input type="date" value={app.trip.date} onChange={(e) => e.target.value && setTrip({ ...app.trip, date: e.target.value })} />
                </label>
                <label>
                  <span>도착 시각</span>
                  <input
                    type="time"
                    value={app.trip.arrive}
                    onChange={(e) => {
                      if (!e.target.value) return
                      // 도착을 바꿨는데 나가는 시각이 그보다 빠르면 기본값(3시간 뒤)으로 맞춘다
                      const nextLeave = stayMin(e.target.value, leave) ? leave : defaultLeave(e.target.value)
                      setTrip({ ...app.trip, arrive: e.target.value, leave: nextLeave })
                    }}
                  />
                </label>
                <label>
                  <span>나갈 시각</span>
                  <input type="time" value={leave} onChange={(e) => e.target.value && setTrip({ ...app.trip, leave: e.target.value })} />
                </label>
              </div>
              {stay ? (
                <p className="stay-line small">
                  <b>약 {fmtStay(stay)}</b> 머물러요. <span className="muted">같은 요일 평균 체류는 {fmtStay(pastStay)}이에요 (2024년 7월 실제 기록).</span>
                  {stay * 60000 > MAX_STAY_MS && <span className="stay-warn"> 예약 주차는 최대 {fmtStay(MAX_STAY_MS / 60000)}까지예요.</span>}
                </p>
              ) : (
                <p className="stay-line stay-warn small" role="alert">
                  나갈 시각은 도착 시각보다 늦어야 해요.
                </p>
              )}
              <button type="button" className="btn btn-primary btn-wide" disabled={!stay} onClick={() => setParams({ go: '1' })}>
                다음 · 가는 방법 보기 →
              </button>
            </section>
          ) : (
            <div id="advice-result" className="fade-up">
              {/* 정한 값은 한 줄로 접어 두고, 아래부터 2구역 · 가는 방법 */}
              <section className="when-sum">
                <div>
                  <span className="muted small">머무는 시간</span>
                  <b>
                    {app.trip.date.slice(5).replace('-', '.')} {app.trip.arrive} ~ {leave}
                  </b>
                  {stay && <span className="muted small"> · 약 {fmtStay(stay)}</span>}
                </div>
                <button type="button" className="link back-btn" onClick={() => setParams({})}>
                  바꾸기
                </button>
              </section>

              <h2 className="page-title step-title how-title">가는 방법</h2>
              {/* 예약 가능 여부는 차로 갈 때만 필요하다. 예약할 수 있을 땐 말하지 않고, 못 할 때만 미리 알려준다 */}
              {!win.open && (
                <p className="book-window small" role="status">
                  <b>지금은 예약할 수 없어요</b> · 예약 접수 {win.from} ~ {win.until} · {win.reason}
                </p>
              )}
              <TravelAdvice
                forecast={fc}
                need={need}
                venue={show.venue}
                onCar={() => setParams({ view: 'map' })}
                shareHead={`[올팍패스] ${show.title}
📍 ${show.venue}${show.visit ? '' : ` · ${show.time} 시작`}
🕔 ${app.trip.date.slice(5).replace('-', '.')} ${app.trip.arrive} 도착 ~ ${leave}${stay ? ` (약 ${fmtStay(stay)})` : ''}`}
              >
                <ForecastPanel />
                <LiveParkingBar />
              </TravelAdvice>
              <p className="need-link">
                <button type="button" className="link back-btn" onClick={() => setParams({ view: 'map' })}>
                  ♿🤰 장애인·임산부 전용 주차면이 필요해요 →
                </button>
              </p>
            </div>
          )}
          {state === 'missing' && <p className="muted small map-status">3D 지도를 찾지 못했어요. 목록으로 비교할 수 있어요.</p>}
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
          <Link to="/map?go=1" className="link back-btn back-top">
            ← 가는 방법으로 돌아가기
          </Link>
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
            <span>🚇 지하철역</span>
            <span>🚌 버스 정류장</span>
            <span className="muted">주차장 색은 예시 현황</span>
          </div>

          <NeedPicker chosen={chosen} />

          {!sel ? (
            <section className="step-panel" aria-live="polite">
              <div className="section-head">
                <h2>{allFull ? '지금은 모든 주차장이 가득 찼어요' : `${show.venue}에 가깝고 자리 있는 곳이에요`}</h2>
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
                {show.venue}까지 도보 약 {sel.lot.walkMin}분
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

              <KakaoRouteButton mode="car" to={placeAt(sel.lot.name, sel.lot.x, sel.lot.z)} note="주차장 위치는 공식 안내도 기준이라 수십 m 어긋날 수 있어요">
                🚗 내 위치에서 {sel.lot.name}까지 길찾기
              </KakaoRouteButton>

              {need !== 'none' && (
                <p className="small need-line">
                  {NEED_LABEL[need]} 주차면으로 예약해요 · 이 주차장 {needCount(sel.lot, need)}면 <span className="tag">예시</span>
                </p>
              )}
              {chosen !== 'none' && need === 'none' && !ticket && (
                <p className="info-bar small">
                  {NEED_LABEL[chosen]} 주차면은 인증 후에 고를 수 있어요.{' '}
                  <button type="button" className="link back-btn" onClick={() => document.getElementById('need-picker')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                    인증하러 가기
                  </button>
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
                  <StayPicker pastStay={pastStay} />
                  <label>
                    <span>휴대전화 번호</span>
                    <input type="tel" inputMode="numeric" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-1234-5678" maxLength={13} required />
                  </label>
                  <label>
                    <span>차량번호</span>
                    <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="12가 3456" maxLength={9} required />
                  </label>
                  <p className="reserve-when">
                    예약 시간 <b>{formatWhen(when)}</b>
                    <span className="muted small"> · {formatClock(when + HOLD_MS)}까지 자리 유지</span>
                  </p>
                  <p className="small">
                    주차 가능 {formatClock(when)} ~ {formatClock(when + MAX_STAY_MS)} (최대 {MAX_STAY_MS / 3600000}시간) · 예약 자리 {sel.st.onlineLimit}면 중{' '}
                    <b>{Math.max(0, sel.st.onlineLimit - sel.ahead)}면</b> 남음
                  </p>
                  <ReservePolicy />
                  {!win.open && <p className="info-bar small warn">{win.reason}</p>}
                  {error && <p className="error small">{error}</p>}
                  <button className="btn btn-primary" type="submit" disabled={!win.open || !stay}>
                    {win.open ? '이 시간으로 예약하기' : '지금은 예약할 수 없어요'}
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
            지도 데이터 ©{' '}
            <a className="link" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap
            </a>{' '}
            기여자
          </p>
        </>
      )}
    </div>
  )
}
