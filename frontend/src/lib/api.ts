export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type ChatMessagesParams = {
  message?: string
  category?: string
  quickReply?: string
}

type BackendMessageItem = {
  role: 'user' | 'ai'
  message: string
}

export type ChatMessagesResponse = {
  messages: BackendMessageItem[]
  session_id: string
}

// backendの共通エラーレスポンス形状（backend/app/main.py の http_exception_handler 参照）
export type ApiErrorResponse = {
  error: {
    code: number
    message: string
  }
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function sendChatMessages(
  params: ChatMessagesParams,
  sessionId: string | null,
): Promise<ChatMessagesResponse> {
  // APIキーはブラウザに出せないため、Next.jsサーバー側のRoute Handler経由でbackendへ送る
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: params.message ?? '',
      category: params.category,
      quickReply: params.quickReply,
      session_id: sessionId,
    }),
  })

  if (!res.ok) {
    let message = `API error: ${res.status}`
    try {
      const data: ApiErrorResponse = await res.json()
      if (data?.error?.message) message = data.error.message
    } catch {
      // レスポンスボディがJSONでない場合はフォールバックのメッセージを使う
    }
    throw new ApiError(res.status, message)
  }

  return res.json()
}
