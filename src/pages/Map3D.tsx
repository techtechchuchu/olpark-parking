import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { LOTS, lotsFor, showById } from '../data'
import { LEVEL_LABEL, STATUS_LABEL, activeQueue, isActive, joinQueue, level, remaining, useApp, waitRange } from '../store'
import { ForecastPanel } from '../forecast'
import { LiveParkingBar } from '../live'
import { DemoTag } from '../ui'
import { TripForm, UpcomingShows } from './Home'

const UNITY_URL = '/unity/index.html'
// 공연 장소 이름 -> 3D 지도 안의 건물 이름
const VENUE_3D: Record<string, string> = {
  'KSPO DOME': 'KSPO DOME',
  올림픽홀: '올림픽홀',
  '올림픽공원 야외무대': '88잔디마당 야외무대',
}
const short = (name: string) => name.replace('올림픽공원 ', '')

export default function Map3D() {
  const app = useApp()
  const frame = useRef<HTMLIFrameElement>(null)
  const [state, setState] = useState<'checking' | 'ready' | 'missing'>('checking')
  // 3D 파일이 커서(약 18MB) 좁은 화면에서는 눌렀을 때만 불러온다
  const [load3d, setLoad3d] = useState(() => window.innerWidth >= 700)
  const [picked, setPicked] = useState<string | null>(null)
  const [nick, setNick] = useState('')
  const [vehicle, setVehicle] = useState('DEMO-1234')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // SPA 대체 응답(index.html)과 구분하기 위해 Unity 빌드 표식을 확인
    fetch(UNITY_URL)
      .then((r) => (r.ok ? r.text() : ''))
      .then((t) => setState(t.includes('unity-canvas') ? 'ready' : 'missing'))
      .catch(() => setState('missing'))
  }, [])

  const show = showById(app.trip.showId)
  const rows = lotsFor(show.venue).map((l) => {
    const st = app.lots[l.id]
    const ahead = activeQueue(app, l.id).length
    return { lot: l, st, ahead, wait: waitRange(st, ahead), lv: level(st) }
  })
  const best = [...rows].sort((a, b) => a.wait[0] - b.wait[0] || a.lot.walkMin - b.lot.walkMin)[0].lot
  const sel = rows.find((r) => r.lot.id === (picked ?? best.id))!
  // 이 브라우저에서 이 주차장에 이미 받은 대기번호
  const ticket = app.queue.find((q) => q.mine && q.lotId === sel.lot.id && isActive(q))

  // 주차 현황을 Unity 씬으로 전달 (unity/index.html 이 받아서 SendMessage 로 넘김)
  const payload = JSON.stringify({
    venue: VENUE_3D[show.venue] ?? '',
    best: sel.lot.osm || 'pin-' + sel.lot.id, // 안내선은 지금 보고 있는 주차장 -> 공연장
    lots: rows.map((r) => ({ osm: r.lot.osm || 'pin-' + r.lot.id, name: r.lot.zone, remaining: remaining(r.st), total: r.st.total, level: r.lv, x: r.lot.x, z: r.lot.z })),
  })

  useEffect(() => {
    if (state !== 'ready' || !load3d) return
    const send = () => frame.current?.contentWindow?.postMessage({ type: 'olpark-parking', payload }, window.location.origin)
    send()
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return
      if (e.data?.type === 'olpark-ready') send()
      if (e.data?.type === 'olpark-lot-click') {
        const lot = LOTS.find((l) => (l.osm || 'pin-' + l.id) === e.data.osm)
        if (lot) {
          setPicked(lot.id)
          setError(null)
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [state, load3d, payload])

  const reserve = (e: FormEvent) => {
    e.preventDefault()
    const v = vehicle.trim().toUpperCase()
    if (!/^DEMO-[A-Z0-9-]{1,12}$/.test(v)) {
      setError('시연용 식별번호는 DEMO-로 시작해야 해요. (예: DEMO-1234)')
      return
    }
    setError(joinQueue(sel.lot.id, nick.trim() || '관람객', v, app.trip.arrive))
  }

  return (
    <div className="container section">
      <p className="eyebrow">올림픽공원 공연 관람객을 위한 주차 가이드</p>
      <div className="section-head">
        <h1 className="page-title">공연 가는 길, 주차부터 미리 확인하세요</h1>
        <DemoTag>주차장별 잔여·대기는 예시</DemoTag>
      </div>
      <TripForm />
      <p className="muted main-summary">
        <b>{show.title}</b> · {show.venue} 기준, 지금 대기가 가장 짧은 곳은 <b className="accent">{short(best.name)}</b>입니다. 주차장을 누르면 바로 대기 예약을 할 수 있어요.
      </p>

      <div className="chips lot-chips" role="tablist" aria-label="주차장 선택">
        {rows.map((r) => (
          <button
            key={r.lot.id}
            type="button"
            role="tab"
            aria-selected={sel.lot.id === r.lot.id}
            className={'chip' + (sel.lot.id === r.lot.id ? ' on' : '')}
            onClick={() => {
              setPicked(r.lot.id)
              setError(null)
            }}
          >
            <i className={`dot lv-${r.lv}`} /> {short(r.lot.name)} · {remaining(r.st)}면
          </button>
        ))}
      </div>

      <div className="map3d">
        <div className="unity-frame">
          {state === 'ready' && load3d && <iframe ref={frame} src={UNITY_URL} title="올림픽공원 3D 지도" allow="fullscreen" />}
          {state === 'ready' && !load3d && (
            <div className="empty">
              <b>3D 공원 지도</b>
              <p className="muted small">파일이 약 18MB라 와이파이에서 여는 것을 권해요.</p>
              <button type="button" className="btn btn-primary" onClick={() => setLoad3d(true)}>
                3D 지도 불러오기
              </button>
            </div>
          )}
          {state === 'checking' && <p className="muted">3D 화면을 확인하는 중…</p>}
          {state === 'missing' && (
            <div className="empty">
              <b>3D 빌드가 아직 없어요</b>
              <p className="muted small">Unity WebGL 빌드를 public/unity 폴더에 넣으면 이 자리에 표시됩니다.</p>
            </div>
          )}
        </div>

        <aside className="reserve-card" aria-live="polite">
          <div className="lot-top">
            <b className="reserve-title">{sel.lot.name}</b>
            <span className={`badge lv-${sel.lv}`}>● {LEVEL_LABEL[sel.lv]}</span>
          </div>
          <p className="muted small">
            {sel.lot.area} · 가능 {sel.lot.capacity}대 · {show.venue}까지 도보 약 {sel.lot.walkMin}분
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
              <span className="muted small">내 대기번호</span>
              <b>{String(ticket.no).padStart(3, '0')}</b>
              <span className={`badge st-${ticket.status}`}>{STATUS_LABEL[ticket.status]}</span>
              <Link to="/queue" className="btn btn-outline btn-sm">
                내 대기 보기 →
              </Link>
            </div>
          ) : (
            <form className="reserve-form" onSubmit={reserve}>
              <label>
                <span>닉네임</span>
                <input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="예: 올팍러버" maxLength={12} />
              </label>
              <label>
                <span>시연용 차량 식별번호</span>
                <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="DEMO-1234" maxLength={17} />
              </label>
              {error && <p className="error small">{error}</p>}
              <button className="btn btn-primary" type="submit">
                여기로 대기 예약하기
              </button>
              <p className="muted small">도착 예정 {app.trip.arrive} · 시연용이며 주차 공간을 확보해 주지는 않아요. 실제 차량번호는 입력하지 마세요.</p>
            </form>
          )}
          <Link to={`/parking/${sel.lot.id}`} className="link">
            과거 패턴·요금 상세 보기 →
          </Link>
        </aside>
      </div>

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
        <span>
          <i className="dot lv-none" /> 현황 미연동
        </span>
      </div>
      <p className="muted small" style={{ textAlign: 'center', marginTop: 8 }}>
        끌어서 이동 · Ctrl+휠 또는 +/− 버튼으로 확대/축소 · 오른쪽 버튼 드래그나 ⟲ ⟳ 버튼으로 회전 · 지도 데이터 ©{' '}
        <a className="link" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>{' '}
        기여자 (ODbL) · 건물 높이는 추정값
      </p>

      <LiveParkingBar />
      <ForecastPanel />
      <p className="main-more">
        <Link to="/parking" className="btn btn-outline">
          주차장 8곳 목록으로 비교하기 →
        </Link>
      </p>

      <UpcomingShows />
    </div>
  )
}
