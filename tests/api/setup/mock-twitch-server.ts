import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"

type QueueEntry = {
  pathPattern: string
  body: unknown
  status: number
}

const queue: QueueEntry[] = []

function handleRequest(
  method: string,
  url: string,
  rawBody: string,
  respond: (status: number, body: string) => void,
) {
  if (url === "/__mock" && method === "POST") {
    queue.push(JSON.parse(rawBody))
    respond(204, "")
    return
  }

  if (url === "/__mock" && method === "DELETE") {
    queue.length = 0
    respond(204, "")
    return
  }

  const idx = queue.findIndex(({ pathPattern }) => url.includes(pathPattern))
  if (idx === -1) {
    console.error(`[mock-twitch] No mock queued for: ${method} ${url}`)
    respond(500, JSON.stringify({ error: `No mock queued for ${url}` }))
    return
  }

  const [entry] = queue.splice(idx, 1)
  respond(entry.status, JSON.stringify(entry.body))
}

export function createMockTwitchServer(): Server {
  return createServer((req, res) => {
    let body = ""
    req.on("data", (chunk) => (body += chunk))
    req.on("end", () => {
      handleRequest(
        req.method ?? "GET",
        req.url ?? "/",
        body,
        (status, responseBody) => {
          res.writeHead(status, { "Content-Type": "application/json" })
          res.end(responseBody)
        },
      )
    })
  })
}

export async function startMockTwitchServer(
  port = 0,
): Promise<{ url: string; server: Server }> {
  const server = createMockTwitchServer()
  await new Promise<void>((resolve) =>
    server.listen(port, "127.0.0.1", resolve),
  )
  const { port: boundPort } = server.address() as AddressInfo
  return { url: `http://127.0.0.1:${boundPort}`, server }
}
