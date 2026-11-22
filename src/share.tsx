import { useState } from 'react'

// 공유하기: 휴대폰에서는 기기의 공유 창(카카오톡·메모·문자 등)을 열고,
// 공유 창이 없는 PC 브라우저에서는 내용을 복사해 붙여넣게 한다.
// 브라우저 기본 기능만 쓰므로 인증키와 비용이 없다.

const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // 권한이 없거나 오래된 브라우저: 임시 입력칸으로 복사
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    ta.remove()
    return ok
  }
}

/** 공유할 글 한 덩어리. 빈 줄(null·'')은 건너뛴다 */
export const shareLines = (...lines: (string | null | undefined | false)[]) => lines.filter(Boolean).join('\n')

/**
 * 공유 버튼 둘: "카톡 등으로 공유"(기기 공유 창)와 "내용 복사"(메모장 등에 붙여넣기).
 * text: 보낼 글 전체. title: 공유 창에 뜨는 제목
 */
export function ShareBar({ title, text }: { title: string; text: string }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const say = (m: string) => {
    setMsg(m)
    window.setTimeout(() => setMsg(null), 3000)
  }

  const share = async () => {
    try {
      await navigator.share({ title, text })
    } catch (e) {
      // 사용자가 공유 창을 닫은 경우는 조용히 넘어간다
      if ((e as Error)?.name !== 'AbortError') say((await copyText(text)) ? '공유 창을 열지 못해 내용을 복사했어요.' : '공유하지 못했어요.')
    }
  }

  const copy = async () => say((await copyText(text)) ? '복사했어요. 카톡이나 메모장에 붙여넣으세요.' : '복사하지 못했어요. 아래 내용을 길게 눌러 복사해 주세요.')

  return (
    <div className="share-bar">
      <div className="share-actions">
        {canShare && (
          <button type="button" className="btn btn-soft" onClick={share}>
            💬 카톡 등으로 공유
          </button>
        )}
        <button type="button" className="btn btn-soft" onClick={copy}>
          📋 내용 복사
        </button>
      </div>
      {msg && (
        <p className="small share-msg" role="status">
          {msg}
        </p>
      )}
      <button type="button" className="link back-btn small" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '공유할 내용 접기' : '공유할 내용 미리 보기'}
      </button>
      {open && <pre className="share-preview">{text}</pre>}
    </div>
  )
}
