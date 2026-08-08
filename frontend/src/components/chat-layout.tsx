'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Phone, X, Mic, Send, HeartHandshake, BookOpen } from 'lucide-react'
import { sendChatMessages, ApiError, type ChatMessage } from '@/lib/api'
import { getSessionId, storeSessionId } from '@/lib/session'
import { ChecklistModal } from './checklist-modal'
import { CategoryModal } from './category-modal'
import { SafetyModal } from './safety-modal'
import { QUICK_EXIT_SECONDS, EMERGENCY_CONTACTS } from '@/lib/constants'
import { safeExit } from '@/lib/safe-exit'
import { HTTP_STATUS_CODE } from '@/types/http_status_code'

type DisplayMessage = ChatMessage & {
  timestamp: Date
  read?: boolean
}

export function ChatLayout() {
  const [started, setStarted] = useState(false)
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(QUICK_EXIT_SECONDS)
  const [showChecklist, setShowChecklist] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const idleInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Safety timer — auto-exit when time runs out, active for the whole session
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          safeExit()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const handleSend = useCallback(
    async (params?: { message?: string; category?: string; quickReply?: string }) => {
      const message = params ? params.message : input.trim()
      const category = params?.category
      const quickReply = params?.quickReply
      const displayContent = message || category || quickReply || ''
      if (!displayContent || loading) return

      if (!params) setInput('')
      setStarted(true)
      setMessages((prev) => [...prev, { role: 'user', content: displayContent, timestamp: new Date() }])
      setLoading(true)
      setSecondsLeft(QUICK_EXIT_SECONDS) // reset timer on activity

      try {
        const data = await sendChatMessages({ message, category, quickReply }, getSessionId())
        storeSessionId(data.session_id)
        const aiReply = data.messages.find((m) => m.role === 'ai')?.message ?? ''
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { ...prev[prev.length - 1], read: true } as DisplayMessage,
          { role: 'assistant', content: aiReply, timestamp: new Date() },
        ])
      } catch (err) {
        // レート制限時はbackendが返す具体的な案内文をそのまま表示し、それ以外は内部エラーの詳細を出さず汎用文言にとどめる
        const content =
          err instanceof ApiError && err.status === HTTP_STATUS_CODE.RATE_LIMITED
            ? err.message
            : '申し訳ありません、接続に問題が発生しました。少し待ってからもう一度お試しください。'
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content,
            timestamp: new Date(),
          },
        ])
      } finally {
        setLoading(false)
        textareaRef.current?.focus()
      }
    },
    [input, loading],
  )

  const handleChecklistSubmit = (checkedItems: string[]) => {
    const message =
      `DVチェックリストで以下の項目に当てはまりました：\n\n` +
      checkedItems.map((item) => `・${item}`).join('\n')
    handleSend({ message })
  }

  const handleCategorySelect = (label: string) => {
    setShowCategoryModal(false)
    handleSend({ category: label })
  }

  const handleIdleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSend()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const timerMin = Math.floor(secondsLeft / 60)
  const timerSec = secondsLeft % 60
  const timerWarning = secondsLeft <= 60

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-primary)]">
      <SafetyModal idleSecondsLeft={secondsLeft} />
      {showChecklist && (
        <ChecklistModal
          onClose={() => setShowChecklist(false)}
          onSubmit={handleChecklistSubmit}
        />
      )}
      {showCategoryModal && (
        <CategoryModal
          onClose={() => setShowCategoryModal(false)}
          onSelect={handleCategorySelect}
        />
      )}

      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)]">
        <div className="flex gap-2">
          <a
            href={`${EMERGENCY_CONTACTS.police.tel}`}
            className="flex items-center gap-1.5 bg-[var(--color-danger)] text-white px-3 py-2 rounded-xl text-sm font-bold shadow-sm"
          >
            <Phone size={14} />
            {EMERGENCY_CONTACTS.police.number}
          </a>
          <a
            href={`${EMERGENCY_CONTACTS.oneStopSupport.tel}`}
            className="flex items-center gap-1.5 bg-[var(--color-danger)] text-white px-3 py-2 rounded-xl text-sm font-bold shadow-sm"
          >
            <Phone size={14} />
            {EMERGENCY_CONTACTS.oneStopSupport.number}
          </a>
        </div>
        <button
          onClick={safeExit}
          className="flex items-center gap-1.5 border-2 border-red-300 text-red-400 bg-red-50 px-3 py-2 rounded-xl text-sm font-bold transition-colors hover:bg-red-100"
        >
          <X size={14} />
          すぐ閉じる
        </button>
      </header>

      {/* Sub-header: anonymous mode + timer */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-[var(--color-bg-primary)] border-b border-[var(--color-border)]">
        <div className="flex items-center gap-1.5 bg-white/70 border border-[var(--color-border)] rounded-full px-3 py-1 text-xs text-[var(--color-text-secondary)]">
          <span>🕵️</span>
          <span className="font-medium">匿名モード</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
        </div>
        <div
          className={`flex items-center gap-1 text-xs font-mono ${
            timerWarning ? 'text-[var(--color-danger)] font-bold animate-pulse' : 'text-[var(--color-text-muted)]'
          }`}
        >
          <span>⏱</span>
          <span>
            残り {timerMin}分{timerSec.toString().padStart(2, '0')}秒
          </span>
        </div>
      </div>

      {!started ? (
        /* Idle: welcome-screen appearance */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top pane (55%): character + title + input centered */}
          <div className="h-[55%] flex flex-col items-center justify-center text-center px-6 gap-3 overflow-hidden">
            <div className="w-24 h-24 rounded-full bg-[var(--color-accent-light)] flex items-center justify-center shadow-sm flex-shrink-0">
              <HeartHandshake size={50} className="text-[var(--color-accent)]" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-bold text-[var(--color-text-primary)] leading-snug">
                何かお困りごとは<br />ありますか？
              </h1>
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                あなたの気持ちに寄り添い、<br />一緒に解決方法を考えます。
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                この会話は誰にも知られません。🔒
              </p>
            </div>
            {/* Input: fixed width, no mic */}
            <div className="w-full max-w-[320px]">
              <div className="flex items-center bg-[var(--color-bg-secondary)] border border-[var(--color-border)] focus-within:border-[var(--color-accent)] focus-within:ring-1 focus-within:ring-[var(--color-accent)] rounded-xl px-4 py-3 shadow-sm transition-colors">
                <input
                  ref={idleInputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleIdleInputKeyDown}
                  placeholder="メッセージを入力"
                  className="w-full bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none"
                />
              </div>
            </div>
          </div>

          {/* Bottom pane: よくある相談 scrollable */}
          <div className="flex-1 overflow-y-auto px-4 pb-2">
            {/* <h2 className="text-sm font-bold text-[var(--color-text-secondary)] mb-3 flex items-center gap-1.5">
              <span>🌿</span>よくある相談
            </h2> */}
            <div className="flex gap-2 flex-wrap justify-center">
              <button
                onClick={() => setShowCategoryModal(true)}
                className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-full bg-[var(--color-accent-light)] hover:bg-[var(--color-accent-light)]/70 text-[var(--color-accent-dark)] font-medium"
              >
                <span>📁</span>
                <span>よくある相談</span>
              </button>
              <button
                onClick={() => setShowChecklist(true)}
                className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-full bg-[var(--color-accent-light)]/70 text-[var(--color-accent-dark)] font-medium"
              >
                <span>✅</span>
                <span>DVチェックリスト</span>
              </button>
              <button
                onClick={() => {}}
                className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-full bg-[var(--color-accent-light)]/70 text-[var(--color-accent-dark)] font-medium"
              >
                <span>📍</span>
                <span>相談窓口を探す</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Chat area */}
          <main className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
            <div className="max-w-2xl mx-auto space-y-3 pb-2">
              {messages.map((msg, i) => (
                <MessageBubble
                  key={i}
                  message={msg}
                  onSimplify={() => handleSend({ message: 'もう少し簡単に説明してもらえますか？' })}
                />
              ))}

              {loading && (
                <div className="flex items-end gap-2 justify-start">
                  <div className="w-7 h-7 rounded-full bg-[var(--color-accent-light)] flex items-center justify-center flex-shrink-0">
                    <HeartHandshake size={14} className="text-[var(--color-accent-dark)]" />
                  </div>
                  <div className="bg-[var(--color-bubble-ai)] rounded-2xl rounded-tl-sm px-4 py-3">
                    <TypingIndicator />
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </main>

          {/* Footer */}
          <footer className="flex-shrink-0 px-4 pt-3 pb-4">
            <div className="max-w-2xl mx-auto space-y-3">
              {/* Input row */}
              <div className="flex items-end gap-2">
                <div className="flex-1 flex items-end bg-[var(--color-bg-secondary)] border border-[var(--color-border)] focus-within:border-[var(--color-accent)] focus-within:ring-1 focus-within:ring-[var(--color-accent)] rounded-xl transition-colors">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="メッセージを入力してください..."
                    rows={1}
                    className="flex-1 resize-none bg-transparent px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none max-h-36 leading-relaxed"
                    style={{ minHeight: '48px', height: 'auto' }}
                    onInput={(e) => {
                      const el = e.currentTarget
                      el.style.height = 'auto'
                      el.style.height = `${Math.min(el.scrollHeight, 144)}px`
                    }}
                  />
                  <button className="p-3 text-[var(--color-accent)]" aria-label="音声入力（未実装）">
                    <Mic size={18} />
                  </button>
                </div>
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || loading}
                  aria-label="送信"
                  className="flex-shrink-0 w-12 h-12 bg-[var(--color-accent)] hover:bg-[var(--color-accent-dark)] disabled:bg-[var(--color-border)] disabled:cursor-not-allowed text-white rounded-xl shadow-sm flex items-center justify-center transition-colors"
                >
                  <Send size={18} />
                </button>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <FooterActionButton
                  emoji="📁"
                  label="よくある相談"
                  sub="相談内容から選択"
                  onClick={() => {setShowCategoryModal(true);setSecondsLeft(QUICK_EXIT_SECONDS)}}
                  colorClass="bg-amber-50 border-amber-200 text-amber-800"
                />
                <FooterActionButton
                  emoji="✅"
                  label="DVチェックリスト"
                  sub="状況を確認してみる"
                  onClick={() => {setShowChecklist(true);setSecondsLeft(QUICK_EXIT_SECONDS)}}
                  colorClass="bg-teal-50 border-teal-200 text-teal-800"
                />
                <FooterActionButton
                  emoji="📍"
                  label="相談窓口を探す"
                  sub="支援先を見つける"
                  onClick={() => {}}
                  colorClass="bg-rose-50 border-rose-200 text-rose-800"
                />
              </div>
            </div>
          </footer>
        </>
      )}

      {/* 免責文言 + 個人情報リンク: 最下部に固定 */}
      <div className="flex-shrink-0 py-3 text-center border-t border-[var(--color-border)] space-y-1.5 px-4">
        <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
          ※ AIの回答は一般的な情報提供であり、法的・医療的な助言に代わるものではありません。個別のご判断は専門家・相談窓口にご確認ください。
        </p>
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="text-xs text-[var(--color-text-muted)] underline underline-offset-2"
        >
          個人情報取扱に係る利用目的
        </a>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  onSimplify,
}: {
  message: DisplayMessage
  onSimplify: () => void
}) {
  const isUser = message.role === 'user'
  const timeStr = message.timestamp.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const isLong = message.content.length > 80

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {!isUser && (
          <div className="w-7 h-7 rounded-full bg-[var(--color-accent-light)] flex items-center justify-center flex-shrink-0">
            <HeartHandshake size={14} className="text-[var(--color-accent-dark)]" />
          </div>
        )}
        <div
          className={`
            max-w-[min(78vw,320px)] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
            ${isUser
              ? 'bg-[var(--color-bubble-user)] text-[var(--color-text-primary)] rounded-tr-sm'
              : 'bg-[var(--color-bubble-ai)] text-[var(--color-text-primary)] rounded-tl-sm'
            }
          `}
        >
          {message.content}
          {!isUser && isLong && (
            <button
              onClick={onSimplify}
              className="mt-2 flex items-center gap-1 text-xs text-[var(--color-accent)] border border-[var(--color-accent)]/50 rounded-full px-3 py-1 hover:bg-[var(--color-accent-light)] transition-colors"
            >
              <BookOpen size={11} />
              簡単に言うと？
            </button>
          )}
        </div>
      </div>

      {/* Timestamp + read receipt */}
      <div className={`flex items-center gap-1 mt-1 px-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <span className="text-[10px] text-[var(--color-text-muted)]">{timeStr}</span>
        {isUser && message.read && (
          <span className="text-[10px] text-blue-400">✓✓</span>
        )}
      </div>
    </div>
  )
}

function FooterActionButton({
  emoji,
  label,
  sub,
  onClick,
  colorClass,
}: {
  emoji: string
  label: string
  sub: string
  onClick: () => void
  colorClass: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 border rounded-xl px-2 py-2 text-left transition-opacity hover:opacity-75 ${colorClass}`}
    >
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-sm leading-none">{emoji}</span>
        <span className="text-[11px] font-bold leading-tight">{label}</span>
      </div>
      <p className="text-[9px] opacity-60 leading-tight pl-5">{sub}</p>
    </button>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-[var(--color-text-muted)] animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}
