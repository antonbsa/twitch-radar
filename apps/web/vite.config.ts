import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { changelogPlugin } from "./vite-plugins/changelog-plugin"
import { appIconPlugin } from "./vite-plugins/app-icon-plugin"
import { loadDevEnv } from "../../infra/scripts/dev/load-env.mjs"

export default defineConfig(() => {
  const envDir = fileURLToPath(new URL("../..", import.meta.url))
  const { apiPort, webPort } = loadDevEnv()

  return {
    envDir,
    plugins: [react(), tailwindcss(), changelogPlugin(), appIconPlugin()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      // Allow Cloudflare Tunnel hostnames to connect to this dev server,
      // so that OAuth redirects can reach it from another device.
      // (The tunnel hostname is the only way to reach this dev server
      // from another device, since it's running on localhost.)
      allowedHosts: [".trycloudflare.com"],
      port: Number(webPort),
      // Fail instead of silently moving to the next free port: the API's
      // PUBLIC_URL (and the Twitch redirect URI) is derived from WEB_DEV_PORT.
      strictPort: true,
      proxy: {
        // Always the local worker, not `PUBLIC_URL` from env — `wrangler dev`
        // and this Vite server always run on the same machine, on
        // API_DEV_PORT (infra/scripts/dev/load-env.mjs). `PUBLIC_URL` itself may be
        // a public tunnel URL (for OAuth redirects to work on another
        // device); proxying to that instead of localhost would forward a
        // request back out through the tunnel into this same dev server,
        // which proxies it again — an infinite self-loop that silently
        // drops the request (observed as OAuth's `code`/`state` query
        // params vanishing by the time they reach the callback handler).
        "/api": {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  }
})
