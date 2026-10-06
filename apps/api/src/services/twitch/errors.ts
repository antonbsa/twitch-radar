// Twitch error bodies are always small JSON in practice; this is a safety
// cap so a pathological response can't blow up a log record, not an
// expected path.
const MAX_ERROR_BODY_LENGTH = 2000

export async function readErrorBody(res: Response): Promise<string> {
  const text = await res.text().catch(() => "")
  return text.slice(0, MAX_ERROR_BODY_LENGTH)
}

export class TwitchApiError extends Error {
  readonly status: number
  readonly body: string
  constructor(message: string, status: number, body: string) {
    super(message)
    this.name = "TwitchApiError"
    this.status = status
    this.body = body
  }
}
