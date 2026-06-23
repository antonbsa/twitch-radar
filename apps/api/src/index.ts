import type { Env } from "./env";
import { createRouter } from "./http/router";

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return createRouter(env)(request);
  },

  async queue(batch: MessageBatch, env: Env): Promise<void> {
    console.log("Queue batch received", {
      queue: batch.queue,
      messages: batch.messages.length,
      environment: env.ENVIRONMENT ?? "local"
    });
  }
} satisfies ExportedHandler<Env>;
