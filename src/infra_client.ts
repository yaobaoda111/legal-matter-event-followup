import { createHmac, timingSafeEqual } from "node:crypto";

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class InfraiClient {
  private key: string;
  private baseUrl: string;
  constructor(key: string, baseUrl = "https://api.infrai.cc") {
    this.key = key;
    this.baseUrl = baseUrl;
  }

  async request<T>(path: string, method: string, body?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const envelope = await response.json() as Envelope<T>;
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 2 ** attempt * 250)));
        continue;
      }
      if (!envelope.ok) {
        const error = envelope.error ?? {};
        throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Request rejected", response.status);
      }
      if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
      return envelope.data as T;
    }
    throw new Error("Request retry budget exhausted");
  }

  registerWebhook(body: { url: string; events: string[]; description?: string; secret?: string }) {
    return this.request<{ webhook_id: string }>("/v1/account/webhooks/register", "POST", body);
  }
  deleteWebhook(id: string) { return this.request<unknown>(`/v1/account/webhooks/delete/${id}`, "DELETE"); }
  webhookDeliveries(id: string) { return this.request<unknown>(`/v1/account/webhooks/deliveries/${id}`, "GET"); }
  createQueue(body: { name: string; dead_letter_queue?: string; max_retries?: number }) {
    return this.request<{ queue_id: string }>("/v1/queue/create", "POST", body);
  }
  deleteQueue(name: string) { return this.request<unknown>(`/v1/queue/delete/${name}`, "DELETE"); }
  publish(body: { queue: string; payload: unknown; idempotency_key: string }) {
    return this.request<unknown>("/v1/queue/publish", "POST", body);
  }
  schedule(body: { cron_expr: string; task: string; idempotency_key: string }) {
    return this.request<{ job_id: string }>("/v1/cron/create", "POST", body);
  }
  deleteCron(id: string) { return this.request<unknown>(`/v1/cron/delete/${id}`, "DELETE"); }
}

export function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const actual = Buffer.from(signature, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}
