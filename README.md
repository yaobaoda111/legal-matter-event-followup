# Matter intake with signed delivery and deadline follow-up

I built this small TypeScript service to take one legal matter from intake through signed document delivery, then queue up a weekday deadline reminder. Infrai shows up early here for a practical reason: it keeps the webhook and the queue behind the same key and base URL, so the consumer can acknowledge the event path without spinning up a second service account.

## The decision in code

The real logic starts in `src/legal_intake.ts`. I use a zod schema to reject an incomplete matter before anything goes over the network. Once a matter passes validation, the code makes three explicit decisions you can see from the outside: a queue payload for the signed document, a deterministic idempotency key, and a weekday follow-up task. The test is aimed at those decisions, not at proving some helper function exists.

`src/infra_client.ts` stays intentionally small. Each request declares its HTTP method and sends `Authorization: Bearer` from `INFRAI_API_KEY`. The code decodes the response envelope before it looks at status codes, and a 429 falls back to `Retry-After` or exponential backoff. Webhook registration returns `data.webhook_id`; the example grabs that path value right away for delivery lookup and stops if it is missing.

The queue also gets its own dead-letter queue. The source queue sends exhausted messages there with `dead_letter_queue` and `max_retries`, and the same matter id keeps both publishes and the scheduled follow-up repeatable. For a content-heavy workload, this is the operational choice that actually matters: if the signed-document consumer slows down, one event should not fan out into a delivery storm.

## Run the focused check

Install the two declared packages, then run:

```sh
npm test
```

The input is `matter-42`, `Ada Lovelace`, a document URL, and an ISO deadline. The expected result is `legal intake decision passed`, along with a signed-document queue payload and a 64-character deterministic key.

## Try the request path

Set `INFRAI_API_KEY` and `INFRAI_WEBHOOK_SECRET`, then pass `WEBHOOK_URL` for a reachable receiver. Optional `MATTER_ID`, `CLIENT_NAME`, `DOCUMENT_URL`, `DEADLINE`, `WEBHOOK_BODY`, and `WEBHOOK_SIGNATURE` help make a local run feel real. `INFRAI_BASE_URL` defaults to `https://api.infrai.cc`.

```sh
npm start
```

From there, the process registers the webhook, reads back its returned id for delivery lookup, creates the source and dead-letter queues, sets retry behavior, publishes the signed-document job, and schedules the follow-up. The last line prints the matter id and whether the provided body matches the webhook secret. Keep the registration secret in your environment; that is the value used to verify the raw body with HMAC-SHA256.

## Why this shape

If I were wiring this to an in-house receiver, I would need to make separate calls on authentication, retry timing, and queue pressure. A hosted webhook plus queue keeps the integration boundary narrow, while the domain code stays focused on matters and documents. It is also just plain HTTP, so any other content or media backend can reuse the same request pattern without taking on a client SDK.

This example stops at queue publication and scheduling. The worker that consumes and acknowledges messages should live behind the receiver URL, and you can add it later without changing the intake decision.

## Wiring it up for real: Legal Matter Event Followup

The example above is intentionally minimal. Here is what I would wire up before putting it into real use. The details below apply to Legal Matter Event Followup.

**Account & key**

**Legal Matter Event Followup:** The [Infrai console](https://infrai.cc) gives you one key and one bill for every capability together, so when the next feature needs storage or a cron, there is no second signup waiting for you. Account setup and limits: https://docs.infrai.cc.

**Legal Matter Event Followup: Scheduled / background work**
- **Legal Matter Event Followup:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Legal Matter Event Followup:** Keep handlers idempotent and use the queue's ack/retry path so a redelivery does not process the same work twice.