import { useEffect, useState } from 'react'
import { LOTS, NEED_LABEL } from '../data'
import { DEFAULT_FILTERS, PARKLOG, analyze } from '../history'
import type { Filters } from '../history'
import { STATUS_LABEL, activeQueue, advanceQueue, cancelQueue, fmtStay, formatWhen, stayMin, markNoShow, maskPhone, releaseCar, remaining, resetAll, saveLotSettings, useApp } from '../store'
import { DemoTag, FilterPanel, RealTag } from '../ui'

const NEXT_LABEL = { waiting: '입차 준비', ready: '호출', called: '입차 완료' } as const

export default function Admin() {
  const app = useApp()
  const [lotId, setLotId] = useState(LOTS[0].id)
  const st = app.lots[lotId]
  const [total, setTotal] = useState(st.total)
  const [limit, setLimit] = useState(st.onlineLimit)
  const [msg, setMsg] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)

  useEffect(() => {
    setTotal(st.total)
    setLimit(st.onlineLimit)
  }, [lotId, st.total, st.onlineLimit])

  const queue = activeQueue(app, lotId)
  const a = analyze(filters, app.trip.date)

  return (
    <div className="container section">
      <p className="eyebrow">OPERATOR DEMO</p>
      <h1 className="page-title">주차장 관리자 시연</h1>
      <p className="muted">인증 없는 시연 화면입니다. 변경은 동일 브라우저의 이용자 화면에 반영됩니다.</p>

      <div className="toolbar">
        <label className="inline-select">
          <span className="muted small">주차장 선택</span>
          <select value={lotId} onChange={(e) => (setLotId(e.target.value), setMsg(null))}>
            {LOTS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <div className="toolbar-right">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => releaseCar(lotId)}>
            차량 1대 출차 처리
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm danger"
            onClick={() => {
              if (window.confirm('모든 시연 데이터를 처음 상태로 되돌릴까요?')) resetAll()
            }}
          >
            전체 시연 데이터 초기화
          </button>
        </div>
      </div>

      <div className="stat-row four">
        <div className="stat-card">
          <span className="muted small">전체 주차면</span>
          <b className="big">{st.total}면</b>
        </div>
        <div className="stat-card">
          <span className="muted small">점유면</span>
          <b className="big">{st.occupied}면</b>
        </div>
        <div className="stat-card">
          <span className="muted small">일반 잔여면</span>
          <b className="big accent">{remaining(st)}면</b>
        </div>
        <div className="stat-card">
          <span className="muted small">호출 임시 배정면</span>
          <b className="big">{st.temp}면</b>
        </div>
      </div>

      <section className="panel">
        <form
          className="filter-row"
          onSubmit={(e) => {
            e.preventDefault()
            saveLotSettings(lotId, total, limit)
            setMsg('설정을 저장했어요.')
          }}
        >
          <label>
            <span>전체 주차면</span>
            <input type="number" min={st.occupied + st.temp} max={2000} value={total} onChange={(e) => setTotal(Number(e.target.value))} />
          </label>
          <label>
            <span>예약 받을 자리 수</span>
            <input type="number" min={0} max={total} value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
          </label>
          <button className="btn btn-primary" type="submit">
            설정 저장
          </button>
        </form>
        <p className="small">
          예약 자리 <b>{st.onlineLimit}면</b> 중 예약됨 <b>{queue.length}면</b> · 예약되지 않은 <b>{Math.max(0, st.onlineLimit - queue.length)}면</b>은 당일에 일반 자리로 바뀝니다.
        </p>
        <p className="muted small">예약 접수는 주차일 이틀 전부터 하루 전까지 · 임시 배정면은 일반 잔여면과 중복 계산하지 않습니다.</p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>
            대기자 목록 <span className="accent">{queue.length}</span>
          </h3>
          <DemoTag />
        </div>
        <p className="muted small">앞선 순서부터 준비 → 호출 → 완료 · 예약 시간(또는 호출)에서 10분이 지나면 자동으로 노쇼·만료 처리되고 주차면이 반환됩니다</p>
        {msg && <p className="info-bar small">{msg}</p>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>대기번호</th>
                <th>차량번호 / 연락처</th>
                <th>예약 시간</th>
                <th>현재 상태</th>
                <th>처리</th>
              </tr>
            </thead>
            <tbody>
              {queue.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    대기 중인 차량이 없습니다.
                  </td>
                </tr>
              )}
              {queue.map((q) => (
                <tr key={q.no}>
                  <td>
                    <b>{String(q.no).padStart(3, '0')}</b>
                  </td>
                  <td>
                    {q.vehicle}
                    <br />
                    <span className="muted small">{maskPhone(q.phone)}</span>
                    {q.kind && q.kind !== 'none' && <span className="tag">{NEED_LABEL[q.kind]}</span>}
                    {q.slot && <span className="tag">자리 {q.slot}</span>}
                  </td>
                  <td>
                    {q.reservedAt ? formatWhen(q.reservedAt) : q.arrive}
                    {(q.postponed ?? 0) > 0 && <span className="tag">미룸</span>}
                    {q.leave && stayMin(q.arrive, q.leave) && (
                      <>
                        <br />
                        <span className="muted small">체류 약 {fmtStay(stayMin(q.arrive, q.leave)!)}</span>
                      </>
                    )}
                  </td>
                  <td>
                    <span className={`badge st-${q.status}`}>{STATUS_LABEL[q.status]}</span>
                  </td>
                  <td className="actions">
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setMsg(advanceQueue(lotId, q.no))}>
                      {NEXT_LABEL[q.status as keyof typeof NEXT_LABEL]}
                    </button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => markNoShow(lotId, q.no)}>
                      노쇼
                    </button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => cancelQueue(lotId, q.no)}>
                      취소
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <FilterPanel value={filters} onChange={setFilters} tripDate={app.trip.date} />
      <section className="panel">
        <div className="panel-head">
          <h3>과거 입출차 조회 · {a.label}</h3>
          <RealTag />
        </div>
        <p className="small">
          {PARKLOG.from} ~ {PARKLOG.to} · 분석 날짜 {a.days}일 / 입차 {a.records.toLocaleString()}건 · 하루 평균 {a.perDay.toLocaleString()}대
        </p>
        <p className="small">
          평균 체류 {a.stayAvg}분 · 중앙 체류 {a.stayMedian}분 · 입차 집중 {a.entryPeak} · 출차 집중 {a.exitPeak}
        </p>
        <p className="small muted">공원 전체 합계 기준 실제 기록입니다. 위의 주차면·대기자 목록은 시연용 예시입니다.</p>
      </section>
    </div>
  )
}
