# Test On A Phone

Use the installed app on a phone against your dev machine. Opening `http://localhost:5173` or a LAN IP from the phone does not work: Twitch redirects to `PUBLIC_URL`, the session cookie is `Secure` (dropped over plain HTTP on a LAN IP), and push and the service worker need HTTPS. One HTTPS tunnel in front of the Vite dev server fixes all three.

Finish [run-locally](run-locally.md) first. For push, also read [test-push](test-push.md); `npm run mock-eventsub` works unchanged through a tunnel.

## Choose A Route

- Script: `npm run dev:mobile`. Needs `cloudflared` installed; `npm run doctor` warns if it is missing.
- Manual: any tunnel, such as `ngrok`.

## With The Script

1. Run `npm run dev:mobile`. It starts a `cloudflared` quick tunnel to `http://localhost:5173`, writes the HTTPS URL to `PUBLIC_URL` in `.env.local`, prints the redirect URI and a QR code of the tunnel URL, then starts `npm run dev`.
2. In the [Twitch console](https://dev.twitch.tv/console/apps), add the printed redirect URI to your app. Twitch has no API for this. Keep the `localhost` one too; several are allowed.
3. Scan the QR code, or open the tunnel URL on the phone.

Ctrl+C stops the tunnel and both dev processes.

## By Hand

1. Start a tunnel and note its HTTPS URL:
   ```sh
   cloudflared tunnel --url http://localhost:5173
   # or: ngrok http 5173
   ```
2. Set `PUBLIC_URL` in `.env.local` to that URL, e.g. `PUBLIC_URL=https://random-words.trycloudflare.com`.
3. Add `https://<tunnel-host>/api/auth/twitch/callback` to the Twitch console's redirect URIs.
4. Restart `npm run dev`.
5. Open the tunnel URL on the phone, not the LAN IP.

To go back to same-machine testing, remove the `PUBLIC_URL` line from `.env.local` and restart `npm run dev`.

## When Something Fails

| Symptom | Cause | Fix |
| --- | --- | --- |
| You finish the Twitch login and land on the login screen again, with `GET /api/me` returning 401 | The registered redirect URI lacks the path, e.g. `https://<tunnel-host>/` instead of `https://<tunnel-host>/api/auth/twitch/callback`. It looks like a cookie bug | Check the console entry first and register the full callback URL |
| The tunnel URL stopped working, or login fails after a restart | Quick tunnels get a new hostname on every restart | Add the new redirect URI (the script prints it), re-save the PWA to the home screen, and on iOS re-enable push |
| Vite shows a blocked-host error | `apps/web/vite.config.ts` allows only `*.trycloudflare.com` in `server.allowedHosts` | Add your tunnel provider's domain there |
| A fixed hostname is wanted | Quick tunnels are random by design | Use a named tunnel on a domain in your Cloudflare account ([docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)) |
