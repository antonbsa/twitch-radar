// Distinct from `npm run dev`'s 8787/5173, so this tier can run
// alongside a live dev server without a port conflict.
export const E2E_API_PORT = 8877
export const E2E_WEB_PORT = 5273

export const E2E_API_URL = `http://localhost:${E2E_API_PORT}`
export const E2E_WEB_URL = `http://localhost:${E2E_WEB_PORT}`

// Nothing listens on port 9 (discard), so Twitch calls from this tier, which has no mock Twitch, fail at once instead of reaching the real API.
export const E2E_UNREACHABLE_TWITCH_URL = "http://127.0.0.1:9"
