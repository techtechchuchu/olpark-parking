import { useState } from 'react'
import type { Need } from './data'
import { NEED_LABEL, busStopsFor, stationsFor } from './data'
import type { Forecast } from './history'

/** 공연장에서 가까운 순서의 지하철역과 걸어서 걸리는 시간 */
export function StationList({ venue }: { venue: string }) {
  const stations = stationsFor(venue)
  return (
    <ul className="stations">
      {stations.map((s, i) => (
        <li key={s.name} className={i === 0 ? 'best' : ''}>
          <span className="station-name">
            <b>{s.name}</b> <span className="tag">{s.lines}</span>
            {i === 0 && <span className="tag tag-real">가장 가까움</span>}
          </span>
          <span className="station-walk">
            걸어서 약 <b>{s.walkMin}분</b>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** 공연장에서 가까운 버스 정류장 3곳 */
export function BusStopList({ venue }: { venue: string }) {
  const stops = busStopsFor(venue).slice(0, 3)
  return (
    <ul className="stations">
      {stops.map((s) => (
        <li key={s.name}>
          <span className="station-name">
            <b>🚌 {s.name}</b>
            {s.ars && <span className="tag">정류장 번호 {s.ars}</span>}
          </span>
          <span className="station-walk">
            걸어서 약 <b>{s.walkMin}분</b>
          </span>
        </li>
      ))}
    </ul>
  )
}

type Advice = { pick: 'transit' | 'car'; tone: 'busy' | 'normal' | 'free' | 'need'; title: string; body: string }

/** 혼잡 예측으로 "대중교통 / 자동차" 중 무엇을 권할지 정한다 */
export function advise(f: Forecast | null, need: Need): Advice {
  if (need !== 'none') {
    return { pick: 'car', tone: 'need', title: `${NEED_LABEL[need]} 주차면을 먼저 안내해 드려요`, body: '대중교통 이용이 어려운 분들을 위해 전용 주차면 예약을 우선 도와드려요.' }
  }
  if (!f) return { pick: 'transit', tone: 'normal', title: '대중교통을 권해요', body: '예측 정보를 불러오지 못했어요. 공연 날에는 주차장이 붐비는 경우가 많아요.' }
  const cars = `약 ${f.expected.toLocaleString()}대`
  if (f.level === 'busy') return { pick: 'transit', tone: 'busy', title: '이 시간엔 많이 붐벼요. 대중교통을 추천해요', body: `${f.dowName}요일 ${f.hour}시에는 공원에 ${cars}가 주차돼 있을 것으로 보여요. 주차장을 찾아 돌거나 입구에서 기다릴 가능성이 높아요.` }
  if (f.level === 'normal') return { pick: 'transit', tone: 'normal', title: '붐비기 시작하는 시간이에요. 대중교통이 더 편해요', body: `${f.dowName}요일 ${f.hour}시에는 공원에 ${cars}가 주차돼 있을 것으로 보여요. 차로 오면 가까운 주차장은 자리가 없을 수 있어요.` }
  return { pick: 'car', tone: 'free', title: '이 시간엔 여유 있어요. 차로 와도 괜찮아요', body: `${f.dowName}요일 ${f.hour}시에는 공원에 ${cars} 정도로 한산한 편이에요. 그래도 대중교통이 가장 확실해요.` }
}

/**
 * 가는 방법 판정: 혼잡하면 대중교통을 먼저 권하고, 차가 꼭 필요한 경우에만 주차장 고르기로 넘긴다.
 * onCar: "차로 갈게요"를 눌렀을 때 (지도 단계로 이동)
 */
export function TravelAdvice({ forecast, need, venue, onCar }: { forecast: Forecast | null; need: Need; venue: string; onCar: () => void }) {
  const [showTransit, setShowTransit] = useState(false)
  const a = advise(forecast, need)
  const nearest = stationsFor(venue)[0]
  const nearestBus = busStopsFor(venue)[0]
  const transitBtn = (
    <button type="button" className={'btn ' + (a.pick === 'transit' ? 'btn-primary' : 'btn-outline')} aria-expanded={showTransit} onClick={() => setShowTransit(true)}>
      🚇 대중교통으로 갈게요
    </button>
  )
  const carBtn = (
    <button type="button" className={'btn ' + (a.pick === 'car' ? 'btn-primary' : 'btn-outline')} onClick={onCar}>
      🚗 {a.pick === 'car' ? '차로 갈게요 · 주차장 고르기 →' : '그래도 차로 갈게요 →'}
    </button>
  )
  return (
    <section className={`advice tone-${a.tone}`} aria-live="polite">
      <p className="eyebrow">어떻게 가는 게 좋을까요?</p>
      <h2>{a.title}</h2>
      <p className="small">{a.body}</p>
      {forecast?.better && a.pick === 'transit' && (
        <p className="small">
          차로 와야 한다면 <b>{forecast.better.hour}시</b>에 도착하는 편이 약 {forecast.better.diff.toLocaleString()}대 덜 붐벼요.
        </p>
      )}
      <p className="advice-station">
        🚇 <b>{nearest.name}</b>({nearest.lines})에서 {venue}까지 걸어서 약 <b>{nearest.walkMin}분</b>
        <br />
        🚌 <b>{nearestBus.name}</b> 정류장에서 걸어서 약 <b>{nearestBus.walkMin}분</b>
      </p>
      <div className="advice-actions">
        {a.pick === 'transit' ? transitBtn : carBtn}
        {a.pick === 'transit' ? carBtn : transitBtn}
      </div>
      {showTransit && (
        <div className="transit-guide">
          <b>좋은 선택이에요. 가까운 역은 여기예요</b>
          <StationList venue={venue} />
          <b>버스로 온다면 이 정류장에서 내리세요</b>
          <BusStopList venue={venue} />
          <ul className="info-list small">
            <li>주차장을 찾아 돌거나 입구에서 기다릴 필요가 없어요.</li>
            <li>공연이 끝난 직후에는 역이 붐벼요. 10~20분 여유를 두면 편해요.</li>
            <li>역·정류장 위치는 실제 지도 좌표이고, 걷는 시간은 직선거리로 계산한 추정값이에요. 서는 버스 노선은 지도 앱에서 정류장 번호로 확인하세요.</li>
          </ul>
        </div>
      )}
    </section>
  )
}
