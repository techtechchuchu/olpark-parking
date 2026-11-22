import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PARKLOG } from '../history'
import { LiveLine } from '../live'
import { UNITY_FILES } from '../ui'

/** 화면에 들어올 때 한 번 떠오르는 구역 */
function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!('IntersectionObserver' in window)) {
      el.classList.add('in')
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.add('in')
          io.disconnect()
        }
      },
      { threshold: 0.15 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={`reveal ${className}`}>
      {children}
    </div>
  )
}

// 타자 치듯 나오는 제목: 질문을 치고 지운 뒤 답을 치고, 다시 다음 질문으로 계속 돈다
const ANSWER = '공연 가는 길,\n주차부터 미리 봅니다'
const ACCENT_FROM = ANSWER.indexOf('미리') // 답에서는 여기부터 강조색
const QUESTIONS = ['공연 날 주차,\n아직도 답답하죠?', '주차 줄에서\n공연 시작을 놓쳤나요?', '어디가 비었는지\n돌아다니셨나요?']
const SCRIPT = QUESTIONS.flatMap((q) => [
  { text: q, answer: false, hold: 1100 },
  { text: ANSWER, answer: true, hold: 2600 },
])

function TypedTitle() {
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [text, setText] = useState(reduce ? ANSWER : '')
  const [answering, setAnswering] = useState(reduce)

  useEffect(() => {
    if (reduce) return
    let stop = false
    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
    ;(async () => {
      await wait(350)
      for (let k = 0; !stop; k = (k + 1) % SCRIPT.length) {
        const line = SCRIPT[k]
        setAnswering(line.answer)
        for (let i = 1; i <= line.text.length && !stop; i++) {
          setText(line.text.slice(0, i))
          await wait(line.text[i - 1] === '\n' ? 260 : 82)
        }
        await wait(line.hold)
        for (let i = line.text.length - 1; i >= 0 && !stop; i--) {
          setText(line.text.slice(0, i))
          await wait(26)
        }
        await wait(250)
      }
    })()
    return () => {
      stop = true
    }
  }, [reduce])

  // 줄바꿈과 강조색을 반영해 지금까지 친 글자를 그린다
  const plain = answering ? text.slice(0, ACCENT_FROM) : text
  const accent = answering ? text.slice(ACCENT_FROM) : ''
  const [first, second] = plain.split('\n')
  return (
    <h1 className="lp-typed" aria-label={ANSWER.replace('\n', ' ')}>
      <span aria-hidden>
        {first}
        {second !== undefined && <br />}
        {second}
        {accent && <span className="accent">{accent}</span>}
        <i className="caret" />
      </span>
    </h1>
  )
}

const FEATURES = [
  {
    n: '01',
    title: '도착 시각의 혼잡을 미리 봅니다',
    body: `같은 요일·같은 시각의 실제 입출차 기록 ${PARKLOG.total.toLocaleString()}건과 지금 실시간 주차대수를 합쳐, 도착할 때 공원이 얼마나 붐빌지 알려드려요.`,
  },
  {
    n: '02',
    title: '3D 지도에서 주차장을 고릅니다',
    body: '실제 건물과 주차장 윤곽으로 만든 올림픽공원 3D 지도에서, 공연장과 가까운 곳·과거에 덜 붐빈 곳을 한눈에 비교해요.',
  },
  {
    n: '03',
    title: '로그인 없이 바로 예약합니다',
    body: '전화번호와 차량번호만 넣으면 대기번호가 나와요. 차 안에서 기다리지 않고, 출발 전에 순서를 확인할 수 있어요.',
  },
  {
    n: '04',
    title: '장애인·임산부 주차도 안내합니다',
    body: '필요한 주차면을 고르면 전용면 안내, 요금 할인, 휠체어 진입로까지 함께 알려드려요.',
  },
]

const STEPS = ['공연을 고릅니다', '도착 시각을 넣고 혼잡 예측을 봅니다', '3D 지도에서 주차장을 고릅니다', '전화번호·차량번호로 예약합니다']

const DATA = [
  ['올림픽공원 실시간 주차현황', '지금 공원에 주차 중인 차량 수'],
  ['올림픽공원 입출차 정보', `2024년 7월 ${PARKLOG.total.toLocaleString()}건의 시간대별 패턴`],
  ['주차장 혼잡도 정보', '주차구역별 원활·혼잡·만차 기록'],
  ['월별주차현황', '연도·월별 주차대수'],
]

/** 첫 화면: 한 줄 소개와 시작 버튼, 스크롤하면 앱 소개 */
export default function Landing() {
  // 소개를 읽는 동안 3D 지도 파일을 자동으로 미리 받기 시작한다 (지원하는 브라우저에서만 동작)
  useEffect(() => {
    const links = UNITY_FILES.map((href) => {
      const l = document.createElement('link')
      l.rel = 'prefetch'
      l.href = href
      document.head.appendChild(l)
      return l
    })
    return () => links.forEach((l) => l.remove())
  }, [])

  return (
    <div className="landing">
      <section className="lp-hero">
        <p className="lp-eyebrow rise" style={{ animationDelay: '0ms' }}>
          올림픽공원 공연 관람객을 위한 주차 가이드
        </p>
        <TypedTitle />
        <p className="lp-sub rise" style={{ animationDelay: '260ms' }}>
          안녕하세요, 올팍입니다.
          <br />
          얼마나 붐빌지 미리 보고, 예약까지 한 번에.
        </p>
        <div className="rise" style={{ animationDelay: '400ms' }}>
          <Link to="/start" className="btn btn-primary lp-cta">
            시작하기
          </Link>
        </div>
        <div className="rise lp-live" style={{ animationDelay: '540ms' }}>
          <LiveLine />
        </div>
        <a href="#about" className="lp-scroll" aria-label="아래로 스크롤해 소개 보기">
          ⌄
        </a>
      </section>

      <section id="about" className="lp-section">
        <Reveal>
          <p className="eyebrow">WHAT WE DO</p>
          <h2>주차 걱정, 이렇게 덜어드려요</h2>
        </Reveal>
        {FEATURES.map((f) => (
          <Reveal key={f.n} className="lp-feature">
            <span className="lp-num">{f.n}</span>
            <div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          </Reveal>
        ))}
      </section>

      <section className="lp-section lp-tint">
        <Reveal>
          <p className="eyebrow">HOW IT WORKS</p>
          <h2>네 단계면 끝나요</h2>
        </Reveal>
        <Reveal>
          <ol className="lp-steps">
            {STEPS.map((s, i) => (
              <li key={s}>
                <i>{i + 1}</i>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </Reveal>
      </section>

      <section className="lp-section">
        <Reveal>
          <p className="eyebrow">OPEN DATA</p>
          <h2>한국체육산업개발 공공데이터로 만들었어요</h2>
        </Reveal>
        <Reveal>
          <ul className="lp-data">
            {DATA.map(([name, use]) => (
              <li key={name}>
                <b>{name}</b>
                <span>{use}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">공연 일정과 주차장별 잔여면은 시연용 예시 값이며, 화면에 "예시"로 표시합니다.</p>
        </Reveal>
      </section>

      <section className="lp-section lp-end">
        <Reveal>
          <h2>이제 공연을 골라 볼까요?</h2>
          <Link to="/start" className="btn btn-primary lp-cta">
            시작하기
          </Link>
        </Reveal>
      </section>
    </div>
  )
}
