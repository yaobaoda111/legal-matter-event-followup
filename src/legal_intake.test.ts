import assert from "node:assert/strict";
import { planMatter } from "./legal_intake.ts";

const result = planMatter({
  matterId: "matter-42",
  clientName: "Ada Lovelace",
  documentUrl: "https://example.test/settlement.pdf",
  deadline: "2026-11-30T09:00:00.000Z"
});
assert.equal(result.queuePayload.type, "signed_document_delivery");
assert.equal(result.queuePayload.matterId, "matter-42");
assert.match(result.idempotencyKey, /^[a-f0-9]{64}$/);
console.log("legal intake decision passed");
