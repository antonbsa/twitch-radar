// Fixed ports for the API test tier's worker + mock Twitch server. Both
// processes are spawned by the "test:api:*" npm scripts (see root
// package.json) before vitest runs, so the ports must be static — orchestrator.ts
// talks to them directly with no cross-process discovery mechanism.
export const API_TEST_PORT = 8788
export const MOCK_TWITCH_PORT = 8799

export const API_TEST_URL = `http://127.0.0.1:${API_TEST_PORT}`
export const MOCK_TWITCH_URL = `http://127.0.0.1:${MOCK_TWITCH_PORT}`
