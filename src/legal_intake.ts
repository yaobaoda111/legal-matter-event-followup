import { createHash } from "node:crypto";
import { z } from "zod";

export const matterInput = z.object({
  matterId: z.string().min(1),
  clientName: z.string().min(1),
  documentUrl: z.string().url(),
  deadline: z.string().datetime()
});

export type MatterInput = z.infer<typeof matterInput>;

export function planMatter(input: unknown) {
  const matter = matterInput.parse(input);
  return {
    matter,
    queuePayload: { type: "signed_document_delivery", matterId: matter.matterId, documentUrl: matter.documentUrl },
    followUp: { cron_expr: "0 9 * * 1-5", task: "https://example.test/internal/deadline-follow-up" },
    idempotencyKey: createHash("sha256").update(matter.matterId).digest("hex")
  };
}

export function handleEvent(event: { type: string; matter: MatterInput }) {
  if (event.type === "matter.intake") return planMatter(event.matter);
  return { matter: event.matter, queuePayload: { type: event.type, matterId: event.matter.matterId } };
}
