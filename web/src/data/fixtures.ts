import type { Decision, FileChange } from "@orbit/types";
import type { Agent, Human, Repo, Commit, ActivityItem, Post, Person, DiffLine, DiffFile } from "../types";

export const AGENTS: Agent[] = [
  { id: "atlas", name: "Atlas", model: "Claude Opus 4.5", role: "Backend Agent", status: "active", initials: "AT", repos: 2, commitsWeek: 14, contextUsed: 64 },
  { id: "nova", name: "Nova", model: "GPT-5.1", role: "Frontend Agent", status: "active", initials: "NV", repos: 1, commitsWeek: 9, contextUsed: 41 },
  { id: "rho", name: "Rho", model: "Claude Haiku 4.5", role: "Bugfix Agent", status: "active", initials: "RH", repos: 1, commitsWeek: 6, contextUsed: 22 },
  { id: "juno", name: "Juno", model: "Claude Sonnet 4.5", role: "Test Agent", status: "idle", initials: "JN", repos: 2, commitsWeek: 3, contextUsed: 8 },
  { id: "vega", name: "Vega", model: "Gemini 2.5 Pro", role: "Docs Agent", status: "idle", initials: "VG", repos: 2, commitsWeek: 2, contextUsed: 15 },
];

export const HUMANS: Human[] = [
  { id: "div", name: "Div", role: "Owner", initials: "D", email: "div@strand.dev" },
  { id: "vibhor", name: "Vibhor", role: "Admin", initials: "V", email: "vibhor@strand.dev" },
  { id: "bob", name: "Bob", role: "Member", initials: "B", email: "bob@strand.dev" },
  { id: "jinay", name: "Jinay", role: "Member", initials: "J", email: "jinay@strand.dev" },
];

export function agentById(id: string): Agent | undefined {
  return AGENTS.find((a) => a.id === id);
}

export function humanById(id: string): Human | undefined {
  return HUMANS.find((h) => h.id === id);
}

export function resolvePerson(id: string): Person {
  const a = agentById(id);
  if (a) return { name: a.name, initials: a.initials, isAgent: true };
  const h = humanById(id);
  return { name: h ? h.name : id, initials: h ? h.initials : "??", isAgent: false };
}

const noDecisions: Decision[] = [];

export const REPOS: Repo[] = [
  {
    id: "payments-service",
    name: "payments-service",
    visibility: "Private",
    description: "Core payment processing and ledger reconciliation",
    language: "TypeScript",
    langColor: "#6E88B3",
    activity: "12m ago",
    agentIds: ["atlas", "rho"],
    trendNote: "42 commits this week",
    commits: [
      {
        id: "c1", gitSha: "a3f9c1e", message: "Fix race condition in ledger reconciliation",
        intent: "Fix race condition causing duplicate batch processing under concurrent load.",
        authorId: "atlas", time: "12m ago",
        taskDescription: "Investigate and fix reconciliation double-counting refunds under high concurrency in the ledger service.",
        files: [
          { path: "services/ledger/reconcile.py", lines: [
            { type: "context", text: "  def reconcile_batch(batch_id):" },
            { type: "remove", text: "-     lock = acquire_lock(batch_id, ttl=30)" },
            { type: "add", text: "+     lock = acquire_lock(batch_id, ttl=90)" },
            { type: "add", text: "+     if is_processed(batch_id):" },
            { type: "add", text: "+         return" },
            { type: "context", text: "      process_transactions(batch_id)" },
          ] },
          { path: "services/ledger/lock_manager.py", lines: [
            { type: "context", text: "  class LockManager:" },
            { type: "remove", text: "-     DEFAULT_TTL = 30" },
            { type: "add", text: "+     DEFAULT_TTL = 90" },
          ] },
        ],
        conversation: [
          { role: "human", speakerId: "vibhor", content: "Reconciliation is double-counting refunds under high concurrency. Can you look at the ledger service?", timestamp: "9:02 AM" },
          { role: "tool", speakerId: "atlas", content: 'invoked skill: inspect_service(name: "ledger")', timestamp: "9:03 AM" },
          { role: "agent", speakerId: "atlas", content: "Found it, two workers can grab the same batch when the lock TTL expires mid-processing. Extending TTL and adding an idempotency check on batch_id.", timestamp: "9:04 AM" },
          { role: "tool", speakerId: "atlas", content: 'invoked skill: run_tests(suite: "ledger.concurrency", parallel: 500)', timestamp: "9:10 AM" },
          { role: "agent", speakerId: "atlas", content: "500 parallel batches, zero duplicates. Opening the change.", timestamp: "9:11 AM" },
          { role: "human", speakerId: "vibhor", content: "Nice catch. Approved.", timestamp: "9:14 AM" },
        ],
        decisions: [{
          question: "How to prevent two workers from double-processing the same batch?",
          chosen: "Extend the lock TTL to 90s and add an idempotency check on batch_id before processing.",
          rejected: [
            "Distributed mutex via Redis — new infra dependency for a narrow race window",
            "Retry-based dedup after the fact — the double-processing window still exists, just papered over",
          ],
          reasoning: "The TTL was expiring mid-batch under load, letting a second worker acquire the lock before the first finished. Extending TTL closes the window directly; the idempotency check is a cheap second layer that costs nothing on the happy path.",
        }],
      },
      {
        id: "c2", gitSha: "7b2d80a", message: "Add idempotency key to refund endpoint",
        intent: "Prevent client-side retries from creating duplicate refunds.",
        authorId: "rho", time: "3h ago",
        taskDescription: "PAY-142 — refunds retried by the client are creating duplicates. Add idempotency handling.",
        files: [
          { path: "api/routes/refunds.ts", lines: [
            { type: "context", text: "  export async function createRefund(req) {" },
            { type: "add", text: '+   const key = req.headers["idempotency-key"];' },
            { type: "add", text: "+   const existing = await store.get(key);" },
            { type: "add", text: "+   if (existing) return existing;" },
            { type: "context", text: "    const refund = await processRefund(req.body);" },
          ] },
        ],
        conversation: [
          { role: "human", speakerId: "div", content: "PAY-142, refunds retried by the client are creating duplicates. Add idempotency handling.", timestamp: "Yesterday, 4:40 PM" },
          { role: "tool", speakerId: "rho", content: 'invoked skill: search_codebase(query: "refund endpoint duplicate")', timestamp: "Yesterday, 4:45 PM" },
          { role: "agent", speakerId: "rho", content: "Added an idempotency-key header check backed by the existing key-value store. Opening for review.", timestamp: "Yesterday, 4:58 PM" },
        ],
        decisions: [{
          question: "Where should idempotency state live?",
          chosen: "Reuse the existing key-value store, keyed by the client-supplied idempotency-key header.",
          rejected: ["New dedicated dedup table — unnecessary schema for a value that's already a cache-shaped lookup"],
          reasoning: "The KV store already has the right TTL semantics for this and avoids a migration.",
        }],
      },
      {
        id: "c3", gitSha: "e91a4c2", message: "Add retry backoff to payout worker",
        intent: "Stop payout worker from failing outright on transient network errors.",
        authorId: "atlas", time: "1d ago",
        taskDescription: "Payout worker keeps failing on transient network errors. Add backoff.",
        files: [
          { path: "workers/payout_worker.py", lines: [
            { type: "context", text: "  def run(self):" },
            { type: "remove", text: "-     retry(self.process, times=3)" },
            { type: "add", text: '+     retry(self.process, times=5, backoff="exponential", max_delay=30)' },
          ] },
        ],
        conversation: [
          { role: "human", speakerId: "vibhor", content: "Payout worker keeps failing on transient network errors. Add backoff.", timestamp: "2 days ago" },
          { role: "agent", speakerId: "atlas", content: "Added exponential backoff with 5 retries.", timestamp: "1d ago" },
          { role: "human", speakerId: "vibhor", content: "Cap the max delay at 30s so we do not stall the queue, otherwise looks good.", timestamp: "1d ago" },
          { role: "agent", speakerId: "atlas", content: "Capped at 30s.", timestamp: "1d ago" },
        ],
        decisions: [{
          question: "Fixed or exponential backoff for payout retries?",
          chosen: "Exponential backoff, 5 attempts, capped at 30s per Vibhor's review comment.",
          rejected: ["Fixed 3x retry — insufficient for the AZ failover windows Atlas found while investigating"],
          reasoning: "Failures cluster around AZ failover windows rather than being uniformly random, so bounded exponential backoff recovers faster than a fixed retry count without stalling the payout queue.",
        }],
      },
      {
        id: "c4", gitSha: "2f5e9b7", message: "Draft batch payout reconciliation report",
        intent: "Start documenting the reconciliation flow for the upcoming audit.",
        authorId: "vega", time: "2d ago",
        taskDescription: "Draft internal documentation of the batch reconciliation flow.",
        files: [
          { path: "docs/reconciliation.md", lines: [
            { type: "add", text: "+ ## Reconciliation report (draft)" },
            { type: "add", text: "+ Explains the batch reconciliation flow end to end." },
          ] },
        ],
        conversation: [
          { role: "agent", speakerId: "vega", content: "Starting a draft of the reconciliation doc based on recent ledger changes.", timestamp: "2d ago" },
        ],
        decisions: noDecisions,
      },
    ],
  },
  {
    id: "design-system", name: "design-system", visibility: "Private", description: "Shared UI components and design tokens", language: "TypeScript", langColor: "#6E88B3", activity: "2h ago", agentIds: ["nova"], trendNote: "18 commits this week",
    commits: [
      {
        id: "d1", gitSha: "44ab1e2", message: "Update Button component tokens",
        intent: "Fix cramped button padding at the new type scale.",
        authorId: "nova", time: "2h ago",
        taskDescription: "Buttons feel cramped at the new type scale — adjust padding across all variants.",
        files: [
          { path: "tokens/button.css", lines: [
            { type: "context", text: "  .btn {" },
            { type: "remove", text: "-   padding: 8px 12px;" },
            { type: "add", text: "+   padding: 10px 14px;" },
            { type: "context", text: "  }" },
          ] },
        ],
        conversation: [
          { role: "human", speakerId: "bob", content: "Buttons feel cramped at the new type scale, can you adjust padding?", timestamp: "1:10 PM" },
          { role: "agent", speakerId: "nova", content: "Bumped padding and re-ran the visual regression suite, all button variants pass.", timestamp: "1:24 PM" },
        ],
        decisions: [{
          question: "Bump padding globally or just for the cramped size variant?",
          chosen: "Global bump across all button sizes for consistency.",
          rejected: ["Size-variant-only fix — inconsistent visual rhythm across variants"],
          reasoning: "Bob's audit found the issue at the new type scale broadly, not just one size.",
        }],
      },
      {
        id: "d2", gitSha: "9c3e278", message: "Add focus-visible ring to Input",
        intent: "Close an accessibility gap — keyboard focus was invisible on inputs.",
        authorId: "nova", time: "1d ago",
        taskDescription: "Keyboard focus is invisible on inputs — accessibility flag from the audit.",
        files: [
          { path: "components/Input.tsx", lines: [
            { type: "context", text: "  <input" },
            { type: "add", text: '+   className="focus-visible:ring-2"' },
            { type: "context", text: "  />" },
          ] },
        ],
        conversation: [
          { role: "human", speakerId: "bob", content: "Keyboard focus is invisible on inputs, accessibility flag from the audit.", timestamp: "Yesterday" },
          { role: "agent", speakerId: "nova", content: "Added a visible focus ring that only shows for keyboard navigation.", timestamp: "Yesterday" },
        ],
        decisions: noDecisions,
      },
    ],
  },
  {
    id: "infra-terraform", name: "infra-terraform", visibility: "Private", description: "Cloud infrastructure as code", language: "HCL", langColor: "#8F87B0", activity: "1d ago", agentIds: ["vega"], trendNote: "9 commits this week",
    commits: [
      {
        id: "i1", gitSha: "0f1d8a3", message: "Bump node pool to 3 replicas",
        intent: "Relieve throttling seen during checkout traffic spikes.",
        authorId: "vega", time: "1d ago",
        taskDescription: "We are seeing throttling during checkout traffic spikes — scale up the node pool.",
        files: [
          { path: "cluster/node_pool.tf", lines: [
            { type: "remove", text: "-   replica_count = 2" },
            { type: "add", text: "+   replica_count = 3" },
          ] },
        ],
        conversation: [
          { role: "human", speakerId: "vibhor", content: "We are seeing throttling during checkout traffic spikes, scale up the pool.", timestamp: "2d ago" },
          { role: "agent", speakerId: "vega", content: "Scaled to 3 replicas and validated the plan against the staging state file.", timestamp: "1d ago" },
        ],
        decisions: noDecisions,
      },
      {
        id: "i2", gitSha: "a71bcf0", message: "Restrict S3 bucket policy to VPC endpoint",
        intent: "Close a security-review finding — bucket was reachable outside the VPC.",
        authorId: "vega", time: "4d ago",
        taskDescription: "Security review flagged the bucket as reachable outside the VPC.",
        files: [
          { path: "storage/bucket_policy.tf", lines: [
            { type: "context", text: "  statement {" },
            { type: "add", text: '+   condition { test = "StringEquals" }' },
            { type: "context", text: "  }" },
          ] },
        ],
        conversation: [
          { role: "human", speakerId: "vibhor", content: "Security review flagged the bucket as reachable outside the VPC.", timestamp: "5d ago" },
          { role: "agent", speakerId: "vega", content: "Added a VPC endpoint condition to the bucket policy and confirmed with a plan diff.", timestamp: "4d ago" },
        ],
        decisions: [{
          question: "Restrict via VPC endpoint condition or bucket-level IP allowlist?",
          chosen: "VPC endpoint condition on the bucket policy.",
          rejected: ["IP allowlist — brittle against IP churn inside the VPC"],
          reasoning: "An endpoint condition ties the policy to the VPC's identity rather than its current IP range, so it doesn't need upkeep as addressing changes.",
        }],
      },
    ],
  },
  {
    id: "docs-site", name: "docs-site", visibility: "Public", description: "Public developer documentation", language: "MDX", langColor: "#B39B6E", activity: "3d ago", agentIds: ["vega", "juno"], trendNote: "6 commits this week",
    commits: [
      {
        id: "e1", gitSha: "5d2a9f1", message: "Add API reference for webhooks",
        intent: "Ship webhook docs ahead of the beta opening up.",
        authorId: "juno", time: "2d ago",
        taskDescription: "We need webhook docs before the beta opens up.",
        files: [
          { path: "docs/api/webhooks.mdx", lines: [
            { type: "add", text: "+ ## Webhook events" },
            { type: "add", text: "+ Strand emits a webhook for every commit and review." },
          ] },
        ],
        conversation: [
          { role: "human", speakerId: "div", content: "We need webhook docs before the beta opens up.", timestamp: "3d ago" },
          { role: "agent", speakerId: "juno", content: "Drafted the reference from the webhook schema and added two payload examples.", timestamp: "2d ago" },
        ],
        decisions: noDecisions,
      },
      {
        id: "e2", gitSha: "b810f4c", message: "Fix broken anchor links in quickstart",
        intent: "Fix 404ing anchor links reported against the quickstart guide.",
        authorId: "vega", time: "3d ago",
        taskDescription: "A few anchor links in quickstart 404.",
        files: [
          { path: "docs/quickstart.mdx", lines: [
            { type: "remove", text: "-   [setup](#set-up)" },
            { type: "add", text: "+   [setup](#setup)" },
          ] },
        ],
        conversation: [
          { role: "human", speakerId: "bob", content: "A few anchor links in quickstart 404.", timestamp: "3d ago" },
          { role: "agent", speakerId: "vega", content: "Fixed the anchors and checked the rest of the doc for broken links.", timestamp: "3d ago" },
        ],
        decisions: noDecisions,
      },
    ],
  },
];

export const ACTIVITY: ActivityItem[] = [
  { repoName: "payments-service", authorId: "atlas", text: 'merged "Fix race condition in ledger reconciliation"', time: "12m ago" },
  { repoName: "payments-service", authorId: "rho", text: 'opened "Add idempotency key to refund endpoint" for review', time: "3h ago" },
  { repoName: "design-system", authorId: "nova", text: 'merged "Update Button component tokens"', time: "2h ago" },
  { repoName: "infra-terraform", authorId: "vega", text: 'committed "Bump node pool to 3 replicas"', time: "1d ago" },
  { repoName: "payments-service", authorId: "vibhor", text: 'commented on "Add retry backoff to payout worker"', time: "1d ago" },
  { repoName: "docs-site", authorId: "juno", text: 'opened "Add API reference for webhooks"', time: "2d ago" },
];

export const POSTS: Post[] = [
  { personId: "bob", text: "Design system audit is done, three contrast issues left for Nova to patch." },
  { personId: "vibhor", text: "Ledger fix is live. Reconciliation numbers look clean overnight." },
  { personId: "jinay", text: "Kicking off the GitHub migration guide this week." },
];

export function firstCommitId(repoId: string): string | null {
  const r = REPOS.find((x) => x.id === repoId);
  return r && r.commits[0] ? r.commits[0].id : null;
}

export function lineStyle(l: DiffLine): { bg: string; color: string } {
  if (l.type === "add") return { bg: "rgba(111,191,131,.08)", color: "#9EC9AA" };
  if (l.type === "remove") return { bg: "rgba(201,143,139,.08)", color: "#D6ACA9" };
  return { bg: "transparent", color: "#8A8A92" };
}

export function commitStats(commit: Commit): { filesChanged: number; additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const file of commit.files) {
    for (const line of file.lines) {
      if (line.type === "add") additions++;
      if (line.type === "remove") deletions++;
    }
  }
  return { filesChanged: commit.files.length, additions, deletions };
}

/** Mirrors what OrbitCommit.filesChanged (@orbit/types) will carry once A's API is real. */
export function toFileChanges(commit: Commit): FileChange[] {
  return commit.files.map((f: DiffFile) => {
    const hasContext = f.lines.some((l) => l.type === "context");
    const additions = f.lines.filter((l) => l.type === "add").length;
    const deletions = f.lines.filter((l) => l.type === "remove").length;
    const changeType: FileChange["changeType"] = !hasContext && deletions === 0 ? "added" : "modified";
    return { path: f.path, changeType, additions, deletions };
  });
}
