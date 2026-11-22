import { busStopsFor, stationsFor } from './data'
import { placeAt } from './kakao'
import type { Place } from './kakao'

// 공연장에서 가까운 지하철역·버스 정류장 목록.
// onPick 을 주면 각 줄이 눌리는 버튼이 되어, 누른 곳을 길찾기 도착지로 쓸 수 있다. 안 주면 안내 목록으로만 보인다.
type OnPick = (place: Place, walkMin: number) => void

/** 공연장에서 가까운 순서의 지하철역과 걸어서 걸리는 시간. selected: 지금 도착지로 정한 이름 */
export function StationList({ venue, onPick, selected }: { venue: string; onPick?: OnPick; selected?: string }) {
  const stations = stationsFor(venue)
  return (
    <ul className="stations">
      {stations.map((s, i) => {
        const body = (
          <>
            <span className="station-name">
              <b>{s.name}</b> <span className="tag">{s.lines}</span>
              {i === 0 && <span className="tag tag-real">가장 가까움</span>}
            </span>
            <span className="station-walk">
              걸어서 약 <b>{s.walkMin}분</b>
              {onPick && <span className="station-go">눌러서 길찾기 →</span>}
            </span>
          </>
        )
        if (!onPick) {
          return (
            <li key={s.name} className={i === 0 ? 'best' : ''}>
              {body}
            </li>
          )
        }
        const place = placeAt(s.name, s.x, s.z)
        const on = selected === place.name
        return (
          <li key={s.name} className={'pick' + (i === 0 ? ' best' : '') + (on ? ' on' : '')}>
            <button type="button" aria-pressed={on} onClick={() => onPick(place, s.walkMin)}>
              {body}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** 공연장에서 가까운 버스 정류장 3곳 */
export function BusStopList({ venue, onPick, selected }: { venue: string; onPick?: OnPick; selected?: string }) {
  const stops = busStopsFor(venue).slice(0, 3)
  return (
    <ul className="stations">
      {stops.map((s) => {
        const body = (
          <>
            <span className="station-name">
              <b>🚌 {s.name}</b>
              {s.ars && <span className="tag">정류장 번호 {s.ars}</span>}
            </span>
            <span className="station-walk">
              걸어서 약 <b>{s.walkMin}분</b>
              {onPick && <span className="station-go">눌러서 길찾기 →</span>}
            </span>
          </>
        )
        if (!onPick) return <li key={s.name}>{body}</li>
        // 같은 이름의 지하철역과 헷갈리지 않게 "정류장"을 붙인다
        const place = placeAt(`${s.name} 정류장`, s.x, s.z)
        const on = selected === place.name
        return (
          <li key={s.name} className={'pick' + (on ? ' on' : '')}>
            <button type="button" aria-pressed={on} onClick={() => onPick(place, s.walkMin)}>
              {body}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
