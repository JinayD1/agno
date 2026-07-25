import type { ContextPacket } from "@orbit/types";

// Mock stand-in for GET /api/repos/:id/context (PRD §4.2) — shaped exactly
// like the frozen ContextPacket contract so swapping to the real endpoint
// later is a fetch-only change.
export const CONTEXT_PACKETS: ContextPacket[] = [
  {
    id: "ctx_ttl60", repoId: "payments-service", agentId: "atlas", type: "constraint",
    title: "Ledger lock TTL must exceed 60s for large batches",
    body: "Batches over 5k transactions were still timing out at a 60s TTL under normal load, before concurrency was even a factor.",
    relatedPaths: ["services/ledger/reconcile.py", "services/ledger/lock_manager.py"],
    supersedes: null,
    createdAt: "2026-07-18T14:02:00Z",
    expiresAt: null,
  },
  {
    id: "ctx_ttl90", repoId: "payments-service", agentId: "atlas", type: "constraint",
    title: "Ledger lock TTL must exceed 90s under concurrent load",
    body: "Revises the earlier 60s guidance — under concurrent batch processing the lock needs to outlive the slowest worker, not just the largest batch. 90s covers the p99 processing time with headroom.",
    relatedPaths: ["services/ledger/reconcile.py", "services/ledger/lock_manager.py"],
    supersedes: "ctx_ttl60",
    createdAt: "2026-07-25T09:11:00Z",
    expiresAt: null,
  },
  {
    id: "ctx_redis_rejected", repoId: "payments-service", agentId: "atlas", type: "failed_approach",
    title: "Redis-based distributed lock rejected for batch dedup",
    body: "Considered a Redis mutex to serialize batch processing across workers. Rejected: adds a new infra dependency for a race window that a longer TTL plus an idempotency check closes just as well.",
    relatedPaths: ["services/ledger/reconcile.py"],
    supersedes: null,
    createdAt: "2026-07-25T09:05:00Z",
    expiresAt: null,
  },
  {
    id: "ctx_refund_retry_gap", repoId: "payments-service", agentId: "rho", type: "open_thread",
    title: "Refund retries beyond 3 attempts still uncovered by idempotency key",
    body: "The idempotency-key check covers same-key retries, but clients that regenerate a new key after 3 failed attempts can still double-refund. Needs a follow-up — possibly dedup on (order_id, amount) as a second layer.",
    relatedPaths: ["api/routes/refunds.ts"],
    supersedes: null,
    createdAt: "2026-07-24T17:02:00Z",
    expiresAt: null,
  },
  {
    id: "ctx_payout_az_failover", repoId: "payments-service", agentId: "atlas", type: "discovery",
    title: "Payout worker network errors cluster around us-east-1 AZ failover windows",
    body: "Pulled the last 30 days of payout failures — 80% land inside known AZ failover windows, not random packet loss. Backoff should be tuned to outlast a failover, not just retry quickly.",
    relatedPaths: ["workers/payout_worker.py"],
    supersedes: null,
    createdAt: "2026-07-24T11:30:00Z",
    expiresAt: null,
  },
  {
    id: "ctx_button_contrast", repoId: "design-system", agentId: "nova", type: "discovery",
    title: "Button padding regressed contrast at 1.25x type scale",
    body: "The old 8px/12px padding made the label crowd the border at larger root font sizes, which read as a contrast issue in the audit even though color contrast itself was fine.",
    relatedPaths: ["tokens/button.css"],
    supersedes: null,
    createdAt: "2026-07-25T13:05:00Z",
    expiresAt: null,
  },
  {
    id: "ctx_bucket_vpc", repoId: "infra-terraform", agentId: "vega", type: "constraint",
    title: "S3 bucket policies must restrict to VPC endpoint per security review",
    body: "Any bucket policy touching customer data needs a VPC endpoint condition, not an IP allowlist — flagged as a standing requirement, not just a one-off fix.",
    relatedPaths: ["storage/bucket_policy.tf"],
    supersedes: null,
    createdAt: "2026-07-21T10:00:00Z",
    expiresAt: null,
  },
  {
    id: "ctx_node_pool_manual", repoId: "infra-terraform", agentId: "vega", type: "open_thread",
    title: "Node pool autoscaling is still manual",
    body: "Bumped replica_count by hand to relieve checkout-spike throttling. Worth revisiting with an HPA-driven policy so this doesn't need a human in the loop next time.",
    relatedPaths: ["cluster/node_pool.tf"],
    supersedes: null,
    createdAt: "2026-07-24T09:40:00Z",
    expiresAt: null,
  },
  {
    id: "ctx_webhook_handoff", repoId: "docs-site", agentId: "juno", type: "handoff",
    title: "Webhook docs still need a refund.failed payload example",
    body: "Covered commit.created and review events. Handing off — needs a refund.failed example once the payments-service webhook payload for it is finalized.",
    relatedPaths: ["docs/api/webhooks.mdx"],
    supersedes: null,
    createdAt: "2026-07-23T16:20:00Z",
    expiresAt: null,
  },
];

export const CONTEXT_PACKET_TYPE_LABEL: Record<ContextPacket["type"], string> = {
  constraint: "Constraint",
  failed_approach: "Failed approach",
  open_thread: "Open thread",
  discovery: "Discovery",
  handoff: "Handoff",
};

export const CONTEXT_PACKET_TYPES: ContextPacket["type"][] = [
  "constraint",
  "failed_approach",
  "open_thread",
  "discovery",
  "handoff",
];

export function packetsForPath(packets: ContextPacket[], repoId: string, path: string): ContextPacket[] {
  return packets.filter((p) => p.repoId === repoId && p.relatedPaths.includes(path));
}
