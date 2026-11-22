import { Link } from 'react-router-dom'
import { HOURS, MONTHLY, PARKLOG, SOURCES, analyze, DEFAULT_FILTERS } from '../history'
import raw from '../parking-data.json'
import { DemoTag, RealTag } from '../ui'

// "데이터" 탭: 이 서비스가 어떤 공공데이터를 어디에 쓰는지, 무엇이 실제이고 무엇이 예시인지 한 곳에서 보여준다.
// 숫자는 모두 src/parking-data.json 에서 계산한다 (손으로 적은 값 없음).

type Zone = { zone: string; counts: Record<string, number>; first: string; last: string }
const zones = (raw.congestion.zones as Zone[])
const congestionRecords = zones.reduce((s, z) => s + Object.values(z.counts).reduce((a, b) => a + b, 0), 0)
const congestionFrom = zones.map((z) => z.first).sort()[0]
const congestionTo = zones.map((z) => z.last).sort().at(-1)

function Bars({ values, labels, hi, unit, wide }: { values: number[]; labels: string[]; hi: number; unit: string; wide?: boolean }) {
  const max = Math.max(...values)
  return (
    <div className={'bars' + (wide ? ' bars-wide' : '')} role="img" aria-label={`최대 ${Math.round(max).toLocaleString()}${unit}`}>
      {values.map((v, i) => (
        <div key={i} className={'bar' + (i === hi ? ' hi' : '')} title={`${labels[i]} ${Math.round(v).toLocaleString()}${unit}`}>
          <i style={{ height: `${Math.max(2, (v / max) * 100)}%` }} />
          <span>{labels[i]}</span>
        </div>
      ))}
    </div>
  )
}

export default function DataPage() {
  const all = analyze({ ...DEFAULT_FILTERS, dow: 'all' }, '2026-11-23')
  const peakIdx = all.entry.indexOf(Math.max(...all.entry))
  const months = MONTHLY.map((m) => m.cars)
  const monthLabels = MONTHLY.map((m) => (m.month === 1 ? `${String(m.year).slice(2)}.1` : String(m.month)))
  const maxMonth = MONTHLY[months.indexOf(Math.max(...months))]

  return (
    <div className="container section">
      <p className="eyebrow">DATA</p>
      <h1 className="page-title">이 서비스가 쓰는 데이터</h1>
      <p className="muted">한국체육산업개발이 공공데이터포털에 개방한 올림픽공원 주차 데이터 4가지로 혼잡을 예측해요. 실제 기록과 지어낸 예시 값은 늘 구분해서 표시해요.</p>
      <p className="small">
        <RealTag>실제 데이터</RealTag> 공공데이터 그대로 · <DemoTag>예시</DemoTag> 시연을 위해 지어낸 값
      </p>

      <section className="panel">
        <div className="panel-head">
          <h3>한눈에 보기</h3>
        </div>
        <div className="kpi-row">
          <div>
            <span className="muted small">입출차 기록</span>
            <b>{PARKLOG.total.toLocaleString()}건</b>
            <span className="muted small">{PARKLOG.from.slice(0, 7)} 한 달</span>
          </div>
          <div>
            <span className="muted small">혼잡도 기록</span>
            <b>{congestionRecords.toLocaleString()}건</b>
            <span className="muted small">주차구역 {zones.length}곳</span>
          </div>
          <div>
            <span className="muted small">월별 주차 대수</span>
            <b>{MONTHLY.length}개월</b>
            <span className="muted small">
              {MONTHLY[0].year}.{MONTHLY[0].month}~{MONTHLY.at(-1)!.year}.{MONTHLY.at(-1)!.month}
            </span>
          </div>
          <div>
            <span className="muted small">실시간 주차현황</span>
            <b>API 1개</b>
            <span className="muted small">공원 전체 한 값</span>
          </div>
        </div>
      </section>

      <h2 className="data-h">실제 공공데이터 4가지</h2>
      <div className="data-list">
        <article className="panel">
          <div className="panel-head">
            <h3>① 올림픽공원 입출차 정보</h3>
            <RealTag>파일 · {PARKLOG.from.slice(0, 7)}</RealTag>
          </div>
          <p className="small">{PARKLOG.total.toLocaleString()}건의 입·출차 시각으로 요일·시간대별 평균 입차, 주차 중인 차량 수, 평균 체류시간을 계산해요.</p>
          <p className="small">
            <b>쓰는 곳</b> 도착 시각의 혼잡 예측, "대중교통을 권할지 차로 와도 될지" 판정
          </p>
          <p className="muted small">한계: 동2문·남2문·북2문 합계라서 주차장별 구분은 없어요.</p>
        </article>
        <article className="panel">
          <div className="panel-head">
            <h3>② 주차장 혼잡도 정보</h3>
            <RealTag>파일 · {congestionFrom.slice(0, 7)}~{congestionTo?.slice(0, 7)}</RealTag>
          </div>
          <p className="small">구역({zones.map((z) => z.zone).join('·')})별 원활·혼잡·만차 기록 {congestionRecords.toLocaleString()}건으로, 구역마다 과거에 만차였던 비율과 시간대를 보여줘요.</p>
          <p className="small">
            <b>쓰는 곳</b> 주차장 카드의 "과거 기록에서 만차였던 비율"
          </p>
          <p className="muted small">한계: 기록이 남은 시점만 있어서, 모든 시간대를 빠짐없이 덮지는 않아요.</p>
        </article>
        <article className="panel">
          <div className="panel-head">
            <h3>③ 월별 주차현황</h3>
            <RealTag>파일 · {MONTHLY.length}개월</RealTag>
          </div>
          <p className="small">월별 주차 대수로 계절과 성수기를 봐요. 가장 붐빈 달은 {maxMonth.year}년 {maxMonth.month}월({maxMonth.cars.toLocaleString()}대)이에요.</p>
          <p className="small">
            <b>쓰는 곳</b> 주차장 상세의 월별 추이
          </p>
        </article>
        <article className="panel">
          <div className="panel-head">
            <h3>④ 올림픽공원 실시간 주차현황</h3>
            <RealTag>API · 실시간</RealTag>
          </div>
          <p className="small">지금 공원에 주차 중인 차량 수예요. 장기주차 누적 추정 1,060대를 빼고 보여줘요.</p>
          <p className="small">
            <b>쓰는 곳</b> 소개 화면과 가는 방법의 "지금 공원에 주차 중"
          </p>
          <p className="muted small">한계: 공원 전체 값 하나뿐이라 주차장별 실제 잔여면은 알 수 없어요.</p>
        </article>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h3>시간대별 평균 입차 (대)</h3>
          <RealTag>2024년 7월 실제 기록</RealTag>
        </div>
        <Bars values={all.entry} labels={HOURS.map((h) => String(h))} hi={peakIdx} unit="대" />
        <p className="small">
          입차가 가장 몰리는 시간은 <b>{all.entryPeak}</b>이에요 ({PARKLOG.days}일 평균, 하루 약 {all.perDay.toLocaleString()}대). 오후에도 입차가 꾸준해서, 공연이 있는 저녁 시간대는 이 평균에 공연 관람객이 더해질 수 있어요.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>월별 주차 대수 (올림픽공원)</h3>
          <RealTag>{SOURCES.monthly.replace('한국체육산업개발주식회사_', '')}</RealTag>
        </div>
        <Bars values={months} labels={monthLabels} hi={months.indexOf(Math.max(...months))} unit="대" wide />
      </section>

      <h2 className="data-h">길찾기와 지도</h2>
      <section className="panel">
        <ul className="data-ul small">
          <li>
            <b>지도 윤곽</b> OpenStreetMap 기여자 (ODbL). 3D 지도의 건물·길·연못 윤곽이에요.
          </li>
          <li>
            <b>대중교통 길찾기</b> 카카오맵 경로 조회. 출발지에서 공연장까지 몇 분 걸리고 어떤 호선·버스를 타는지 그때그때 가져오며, 서버에 저장하지 않아요.
          </li>
          <li>
            <b>내 위치</b> 길찾기 한 번에만 쓰고 저장하지 않아요.
          </li>
        </ul>
      </section>

      <h2 className="data-h">시연용 예시 값</h2>
      <section className="panel">
        <p className="small">
          <DemoTag /> 아래는 실제 데이터가 아니라 시연을 위해 지어낸 값이에요.
        </p>
        <ul className="data-ul small">
          <li>공연 일정과 포스터</li>
          <li>주차장별 잔여 주차면과 대기 순서</li>
          <li>주차면 배치, 장애인·임산부 전용면 수</li>
          <li>예약·대기 내역 (이 기기의 브라우저에만 저장돼요)</li>
        </ul>
      </section>

      <h2 className="data-h">예측은 이렇게 해요</h2>
      <section className="panel">
        <ol className="data-ul small">
          <li>
            방문 예정 요일·시간과 같은 시간대의 <b>과거 평균 주차 대수</b>를 구해요.
          </li>
          <li>
            <b>관측 최대치</b>와 견줘서 원활·보통·혼잡으로 나눠요.
          </li>
          <li>혼잡이면 대중교통을, 여유 있으면 차를 권하고, 더 한산한 시간이 있으면 알려드려요.</li>
        </ol>
        <p className="muted small">과거 기록 기반의 단순 통계이고 입차를 보장하지 않아요. 걷는 시간은 직선거리 × 1.3 ÷ 분당 75m의 추정값이에요.</p>
      </section>

      <p className="main-more">
        <Link to="/map" className="btn btn-primary">
          가는 방법 보러 가기 →
        </Link>
      </p>
    </div>
  )
}
