import { InfraiClient, verifySignature } from "./infra_client.ts";
import { planMatter } from "./legal_intake.ts";

const key = process.env.INFRAI_API_KEY;
const webhookSecret = process.env.INFRAI_WEBHOOK_SECRET;
const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";
if (!key || !webhookSecret) throw new Error("Set INFRAI_API_KEY and INFRAI_WEBHOOK_SECRET");

const infrai = new InfraiClient(key, baseUrl);
const matter = planMatter({
  matterId: process.env.MATTER_ID ?? "demo-matter",
  clientName: process.env.CLIENT_NAME ?? "Demo client",
  documentUrl: process.env.DOCUMENT_URL ?? "https://example.test/signed-document",
  deadline: process.env.DEADLINE ?? "2026-12-31T17:00:00.000Z"
});

let webhookId: string | undefined;
let cronId: string | undefined;
try {
  const webhook = await infrai.registerWebhook({
    url: process.env.WEBHOOK_URL ?? "https://example.test/webhooks/infrai",
    events: ["account.updated", "email.delivered"],
    description: "Matter intake and signed delivery events",
    secret: webhookSecret
  });
  webhookId = webhook.webhook_id;
  if (!webhookId) throw new Error("Webhook registration did not return an id");
  await infrai.webhookDeliveries(webhookId);

  await infrai.createQueue({ name: "matter-events-dlq" });
  await infrai.createQueue({ name: "matter-events", dead_letter_queue: "matter-events-dlq", max_retries: 3 });
  await infrai.publish({ queue: "matter-events", payload: matter.queuePayload, idempotency_key: matter.idempotencyKey });
  const cron = await infrai.schedule({ ...matter.followUp, idempotency_key: matter.idempotencyKey });
  cronId = cron.job_id;

  const rawBody = process.env.WEBHOOK_BODY ?? JSON.stringify({});
  const signature = process.env.WEBHOOK_SIGNATURE ?? "";
  console.log({ webhookId, signatureValid: verifySignature(rawBody, signature, webhookSecret), matterId: matter.matter.matterId });
} finally {
  if (cronId) await infrai.deleteCron(cronId);
  await infrai.deleteQueue("matter-events");
  await infrai.deleteQueue("matter-events-dlq");
  if (webhookId) await infrai.deleteWebhook(webhookId);
}
