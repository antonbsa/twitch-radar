export function ReconnectRequired() {
  return (
    <div className="px-4 py-6 text-sm text-muted-foreground">
      <p>Your Twitch connection needs to be renewed.</p>
      <a
        href="/api/auth/twitch/start"
        className="mt-1 inline-block text-primary underline"
      >
        Reconnect Twitch
      </a>
    </div>
  )
}
