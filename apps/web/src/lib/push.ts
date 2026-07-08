const SUBSCRIPTION_ID_STORAGE_KEY = "push-subscription-id"

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

export async function registerServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return
  await navigator.serviceWorker.register("/service-worker.js")
}

// Uses getRegistration() rather than .ready so a failed/missing registration
// resolves to null immediately instead of hanging the status check forever.
export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return null
  return registration.pushManager.getSubscription()
}

export async function subscribeToPush(
  vapidPublicKey: string,
): Promise<PushSubscription> {
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  })
}

export function getStoredSubscriptionId(): string | null {
  return localStorage.getItem(SUBSCRIPTION_ID_STORAGE_KEY)
}

export function storeSubscriptionId(id: string): void {
  localStorage.setItem(SUBSCRIPTION_ID_STORAGE_KEY, id)
}

export function clearStoredSubscriptionId(): void {
  localStorage.removeItem(SUBSCRIPTION_ID_STORAGE_KEY)
}

// The Push API wants the VAPID public key as raw bytes; the server exposes it
// base64url-encoded (RFC 7515), which atob does not accept directly.
export function urlBase64ToUint8Array(
  base64String: string,
): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  // Explicit ArrayBuffer backing so the result satisfies BufferSource under
  // TS 5.7+'s generic TypedArray types.
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length))
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
