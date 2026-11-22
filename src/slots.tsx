import type { Need } from './data'

// 주차면 배치도 (예시). 실제 주차면 배치와 면별 점유 데이터는 공개돼 있지 않아서,
// 주차장의 전체 면수·점유 면수·전용면 수에 맞춰 규칙적으로 그린 그림이다.
const COLS = 12

type Kind = 'general' | 'disabled' | 'family'
export type Slot = { label: string; kind: Kind; taken: boolean }

function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

export function buildSlots(lotId: string, total: number, occupied: number, accessible: number, family: number): Slot[] {
  const slots: Slot[] = Array.from({ length: total }, (_, i) => ({
    label: `${String.fromCharCode(65 + Math.floor(i / COLS))}-${(i % COLS) + 1}`,
    kind: i < accessible ? 'disabled' : i < accessible + family ? 'family' : 'general',
    taken: false,
  }))
  // 주차장마다 항상 같은 순서로 채워지도록 고정된 난수로 섞는다. 전용면은 일반면보다 덜 차게 한다.
  const rnd = seeded(lotId)
  const order = slots.map((s, i) => ({ i, w: rnd() + (s.kind === 'general' ? 0 : 0.35) })).sort((a, b) => a.w - b.w)
  for (let k = 0; k < Math.min(occupied, total); k++) slots[order[k].i].taken = true
  return slots
}

const KIND_LABEL: Record<Kind, string> = { general: '일반', disabled: '장애인 전용', family: '임산부 배려' }

/** 필요에 맞는 면만 고를 수 있다: 일반 이용자는 일반면, 장애인·임산부는 해당 전용면 또는 일반면 */
export function canPick(s: Slot, need: Need) {
  if (s.taken) return false
  if (s.kind === 'general') return true
  return (s.kind === 'disabled' && need === 'disabled') || (s.kind === 'family' && need === 'pregnant')
}

export function SlotMap({ slots, need, value, onChange }: { slots: Slot[]; need: Need; value: string | null; onChange: (label: string | null) => void }) {
  const rows: Slot[][] = []
  for (let i = 0; i < slots.length; i += COLS) rows.push(slots.slice(i, i + COLS))
  const free = slots.filter((s) => !s.taken).length

  return (
    <div className="slotmap">
      <div className="slotmap-head">
        <b>주차면 배치도</b>
        <span className="tag">예시</span>
        <span className="muted small">{free > 0 ? `빈자리 ${free}면 · 자리를 누르면 선택돼요` : '지금은 빈자리가 없어요 · 대기 예약만 할 수 있어요'}</span>
      </div>
      <div className="slot-entrance" aria-hidden>
        ▲ 입구 · 목적지 방향
      </div>
      <div className="slot-rows" role="group" aria-label="주차면 선택">
        {rows.map((row, r) => (
          // 두 줄마다 통로를 둔다
          <div key={r} className={'slot-row' + (r % 2 === 1 ? ' aisle' : '')}>
            <span className="slot-rowname" aria-hidden>
              {String.fromCharCode(65 + r)}
            </span>
            {row.map((s) => {
              const pickable = canPick(s, need)
              const on = value === s.label
              return (
                <button
                  key={s.label}
                  type="button"
                  className={`slot k-${s.kind}` + (s.taken ? ' taken' : '') + (on ? ' on' : '') + (!s.taken && !pickable ? ' locked' : '')}
                  disabled={!pickable}
                  aria-pressed={on}
                  aria-label={`${s.label} ${KIND_LABEL[s.kind]} ${s.taken ? '주차 중' : pickable ? '빈자리' : '전용면'}`}
                  title={`${s.label} · ${KIND_LABEL[s.kind]}${s.taken ? ' · 주차 중' : ''}`}
                  onClick={() => onChange(on ? null : s.label)}
                >
                  {s.kind === 'disabled' ? '♿' : s.kind === 'family' ? '♥' : ''}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <div className="legend slot-legend">
        <span>
          <i className="slot-dot free" /> 빈자리
        </span>
        <span>
          <i className="slot-dot taken" /> 주차 중
        </span>
        <span>
          <i className="slot-dot k-disabled" /> 장애인 전용
        </span>
        <span>
          <i className="slot-dot k-family" /> 임산부 배려
        </span>
        <span>
          <i className="slot-dot on" /> 선택
        </span>
      </div>
      <p className="muted small">실제 주차면 배치와 면별 점유는 공개 데이터가 없어, 전체 면수와 예시 점유 수에 맞춰 그린 그림입니다.</p>
    </div>
  )
}
