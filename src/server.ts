import "dotenv/config"
import fastifyStatic from "@fastify/static"
import Fastify from "fastify"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import { channels } from "./channels.js"
import { configurePush, getPushConfig } from "./push.js"
import {
  createNotification,
  hydrateNotificationTimers,
  listNotifications,
  upsertSubscription,
} from "./notifications.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const publicDir = path.resolve(__dirname, "../public")

const pushSubscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
})

const createNotificationSchema = z.object({
  subscriptionId: z.string().min(1),
  channelId: z.string().min(1),
})

const listNotificationsSchema = z.object({
  subscriptionId: z.string().min(1),
})

const pushConfig = getPushConfig()
configurePush(pushConfig)

const app = Fastify({
  logger: true,
})

await app.register(fastifyStatic, {
  root: publicDir,
  prefix: "/",
})

app.get("/api/config", async () => ({
  vapidPublicKey: pushConfig.publicKey,
  channels,
}))

app.post("/api/push-subscriptions", async (request, reply) => {
  const parsed = pushSubscriptionSchema.safeParse(request.body)

  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid push subscription.",
      details: parsed.error.flatten(),
    })
  }

  const record = await upsertSubscription(parsed.data.subscription)
  return { subscriptionId: record.id }
})

app.post("/api/notifications", async (request, reply) => {
  const parsed = createNotificationSchema.safeParse(request.body)

  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid notification request.",
      details: parsed.error.flatten(),
    })
  }

  try {
    const notification = await createNotification(
      parsed.data.subscriptionId,
      parsed.data.channelId,
    )
    return { notification }
  } catch (error) {
    return reply.status(400).send({
      error:
        error instanceof Error
          ? error.message
          : "Unable to schedule notification.",
    })
  }
})

app.get("/api/notifications", async (request, reply) => {
  const parsed = listNotificationsSchema.safeParse(request.query)

  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid notification list request.",
      details: parsed.error.flatten(),
    })
  }

  return {
    notifications: await listNotifications(parsed.data.subscriptionId),
  }
})

app.setNotFoundHandler((request, reply) => {
  if (request.raw.url?.startsWith("/api/")) {
    return reply.status(404).send({ error: "Not found." })
  }

  return reply.sendFile("index.html")
})

await hydrateNotificationTimers()

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? "0.0.0.0"

await app.listen({ port, host })
