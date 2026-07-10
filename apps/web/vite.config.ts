import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig(() => {
  const envDir = fileURLToPath(new URL("../..", import.meta.url))

  return {
    envDir,
    plugins: [react(), tailwindcss()],
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
      port: 5173,
      proxy: {
        // Always the local worker, not `API_URL` from env — `wrangler dev`
        // and this Vite server always run on the same machine, on this fixed
        // port (apps/api/package.json's dev script). `API_URL` itself may be
        // a public tunnel URL (for OAuth redirects to work on another
        // device); proxying to that instead of localhost would forward a
        // request back out through the tunnel into this same dev server,
        // which proxies it again — an infinite self-loop that silently
        // drops the request (observed as OAuth's `code`/`state` query
        // params vanishing by the time they reach the callback handler).
        "/api": {
          target: "http://localhost:8787",
          changeOrigin: true,
        },
      },
    },
  }
})
