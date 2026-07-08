import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter } from "react-router"
import { AuthProvider } from "@/context/auth-context"
import { App } from "@/App"
import { ApiRequestError } from "@/lib/errors"
import { registerServiceWorker } from "@/lib/push"
import "@/index.css"

// Fire-and-forget: a failed registration only degrades push (surfaced on the
// Account view), it must never block rendering.
registerServiceWorker().catch(() => {})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // 4xx errors won't succeed on retry (missing route, bad request, auth)
        // only retry transient failures (network errors, 5xx).
        if (
          error instanceof ApiRequestError &&
          error.status >= 400 &&
          error.status < 500
        ) {
          return false
        }
        return failureCount < 3
      },
    },
  },
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
