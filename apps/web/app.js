const state = {
  channels: [],
  vapidPublicKey: "",
  subscriptionId: localStorage.getItem("subscriptionId"),
  selectedChannelId: "",
  pushReady: false,
  supportMessage: "",
  notifications: [],
}

const elements = {
  statusPill: document.querySelector("#statusPill"),
  enableButton: document.querySelector("#enableButton"),
  supportMessage: document.querySelector("#supportMessage"),
  channelSelect: document.querySelector("#channelSelect"),
  scheduleButton: document.querySelector("#scheduleButton"),
  scheduleForm: document.querySelector("#scheduleForm"),
  waitingList: document.querySelector("#waitingList"),
  triggeredList: document.querySelector("#triggeredList"),
  waitingCount: document.querySelector("#waitingCount"),
  triggeredCount: document.querySelector("#triggeredCount"),
}

await init()

async function init() {
  const config = await fetchJson("/api/config")
  state.channels = config.channels
  state.vapidPublicKey = config.vapidPublicKey

  renderChannelOptions()
  bindEvents()
  await checkPushState()
  await refreshNotifications()

  setInterval(() => {
    renderNotificationLists()
  }, 1000)

  setInterval(() => {
    refreshNotifications().catch(() => {})
  }, 4000)
}

function bindEvents() {
  elements.enableButton.addEventListener("click", () => {
    enableNotifications().catch(() => {})
  })

  elements.channelSelect.addEventListener("change", (event) => {
    state.selectedChannelId = event.target.value
    renderControls()
  })

  elements.scheduleForm.addEventListener("submit", (event) => {
    event.preventDefault()
    scheduleNotification().catch(() => {})
  })
}

function renderChannelOptions() {
  for (const channel of state.channels) {
    const option = document.createElement("option")
    option.value = channel.id
    option.textContent = `${channel.label} (${channel.delaySeconds}s)`
    elements.channelSelect.append(option)
  }
}

async function checkPushState() {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    setPushState(
      false,
      "Unsupported",
      "Push notifications are not available in this browser.",
    )
    return
  }

  if (Notification.permission === "denied") {
    setPushState(false, "Blocked", "Notification permission is blocked.")
    return
  }

  const registration =
    await navigator.serviceWorker.register("/service-worker.js")
  await navigator.serviceWorker.ready

  const subscription = await registration.pushManager.getSubscription()

  if (subscription && state.subscriptionId) {
    setPushState(true, "Ready", "Notifications are enabled.")
    return
  }

  if (subscription && !state.subscriptionId) {
    const subscriptionId = await saveSubscription(subscription)
    state.subscriptionId = subscriptionId
    localStorage.setItem("subscriptionId", subscriptionId)
    setPushState(true, "Ready", "Notifications are enabled.")
    return
  }

  if (Notification.permission === "granted") {
    setPushState(false, "Enable", "Push subscription is not active.")
    return
  }

  setPushState(false, "Off", "Notifications are off.")
}

async function enableNotifications() {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    setPushState(
      false,
      "Unsupported",
      "Push notifications are not available in this browser.",
    )
    return
  }

  elements.enableButton.disabled = true

  try {
    const permission = await Notification.requestPermission()

    if (permission !== "granted") {
      setPushState(false, "Blocked", "Notification permission was not granted.")
      return
    }

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(state.vapidPublicKey),
    })

    const subscriptionId = await saveSubscription(subscription)
    state.subscriptionId = subscriptionId
    localStorage.setItem("subscriptionId", subscriptionId)
    setPushState(true, "Ready", "Notifications are enabled.")
    await refreshNotifications()
  } catch (error) {
    setPushState(
      false,
      "Error",
      error instanceof Error
        ? error.message
        : "Unable to enable notifications.",
    )
  } finally {
    renderControls()
  }
}

async function saveSubscription(subscription) {
  const response = await fetchJson("/api/push-subscriptions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
    }),
  })

  return response.subscriptionId
}

async function scheduleNotification() {
  if (!state.pushReady || !state.subscriptionId || !state.selectedChannelId) {
    return
  }

  elements.scheduleButton.disabled = true

  try {
    await fetchJson("/api/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subscriptionId: state.subscriptionId,
        channelId: state.selectedChannelId,
      }),
    })

    elements.channelSelect.value = ""
    state.selectedChannelId = ""
    await refreshNotifications()
  } catch (error) {
    setPushState(
      state.pushReady,
      state.pushReady ? "Ready" : "Error",
      error instanceof Error
        ? error.message
        : "Unable to schedule notification.",
    )
  } finally {
    renderControls()
  }
}

async function refreshNotifications() {
  if (!state.subscriptionId) {
    state.notifications = []
    renderNotificationLists()
    return
  }

  const params = new URLSearchParams({ subscriptionId: state.subscriptionId })
  const data = await fetchJson(`/api/notifications?${params.toString()}`)
  state.notifications = data.notifications
  renderNotificationLists()
}

function renderControls() {
  const notificationDenied =
    "Notification" in window && Notification.permission === "denied"
  elements.enableButton.disabled = state.pushReady || notificationDenied
  elements.scheduleButton.disabled =
    !state.pushReady || !state.subscriptionId || !state.selectedChannelId
}

function renderNotificationLists() {
  const waiting = state.notifications.filter(
    (notification) => notification.status === "waiting",
  )
  const triggered = state.notifications.filter(
    (notification) => notification.status !== "waiting",
  )

  elements.waitingCount.textContent = String(waiting.length)
  elements.triggeredCount.textContent = String(triggered.length)
  renderList(elements.waitingList, waiting, "waiting")
  renderList(elements.triggeredList, triggered, "triggered")
}

function renderList(target, notifications, section) {
  target.replaceChildren()

  if (notifications.length === 0) {
    const empty = document.createElement("li")
    empty.className = "empty"
    empty.textContent =
      section === "waiting"
        ? "No waiting notifications"
        : "No triggered notifications"
    target.append(empty)
    return
  }

  for (const notification of notifications) {
    const item = document.createElement("li")
    const isFailed = notification.status === "failed"
    item.className =
      `notification-card ${section === "triggered" ? "old" : ""} ${isFailed ? "failed" : ""}`.trim()

    const main = document.createElement("div")
    main.className = "notification-main"

    const title = document.createElement("div")
    title.className = "notification-title"
    title.textContent = notification.channelLabel

    const badge = document.createElement("span")
    badge.className = "status-pill"
    badge.textContent = statusLabel(notification)

    const meta = document.createElement("p")
    meta.className = "notification-meta"
    meta.textContent = notificationMeta(notification)

    main.append(title, badge)
    item.append(main, meta)
    target.append(item)
  }
}

function statusLabel(notification) {
  if (notification.status === "waiting") {
    return `${remainingSeconds(notification.scheduledFor)}s`
  }

  if (notification.status === "failed") {
    return "Failed"
  }

  return "Sent"
}

function notificationMeta(notification) {
  if (notification.status === "waiting") {
    return `Fires at ${formatTime(notification.scheduledFor)}`
  }

  if (notification.status === "failed") {
    return notification.errorMessage || "Notification failed."
  }

  return `Fired at ${formatTime(notification.triggeredAt)}`
}

function remainingSeconds(dateValue) {
  return Math.max(0, Math.ceil((Date.parse(dateValue) - Date.now()) / 1000))
}

function formatTime(dateValue) {
  if (!dateValue) {
    return ""
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(dateValue))
}

function setPushState(pushReady, label, message) {
  state.pushReady = pushReady
  state.supportMessage = message
  elements.statusPill.textContent = label
  elements.statusPill.classList.toggle("ready", pushReady)
  elements.statusPill.classList.toggle(
    "blocked",
    label === "Blocked" || label === "Error" || label === "Unsupported",
  )
  elements.supportMessage.textContent = message
  renderControls()
}

async function fetchJson(url, options) {
  const response = await fetch(url, options)
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || "Request failed.")
  }

  return data
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = `${base64String}${padding}`
    .replace(/-/g, "+")
    .replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index)
  }

  return outputArray
}
