import type {
  Agent,
  Human,
  Repo,
  ActivityItem,
  Post,
  Person,
  DiffLine,
} from "../types";

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
        id: "c1", hash: "a3f9c1e", message: "Fix race condition in ledger reconciliation", authorId: "atlas", time: "12m ago", filesChanged: 2, additions: 42, deletions: 11,
        files: [
          { name: "services/ledger/reconcile.py", lines: [
            { type: "context", text: "  def reconcile_batch(batch_id):" },
            { type: "remove", text: "-     lock = acquire_lock(batch_id, ttl=30)" },
            { type: "add", text: "+     lock = acquire_lock(batch_id, ttl=90)" },
            { type: "add", text: "+     if is_processed(batch_id):" },
            { type: "add", text: "+         return" },
            { type: "context", text: "      process_transactions(batch_id)" },
          ] },
          { name: "services/ledger/lock_manager.py", lines: [
            { type: "context", text: "  class LockManager:" },
            { type: "remove", text: "-     DEFAULT_TTL = 30" },
            { type: "add", text: "+     DEFAULT_TTL = 90" },
          ] },
        ],
        conversation: [
          { kind: "message", speakerId: "vibhor", text: "Reconciliation is double-counting refunds under high concurrency. Can you look at the ledger service?", time: "9:02 AM" },
          { kind: "tool", speakerId: "atlas", text: 'invoked skill: inspect_service(name: "ledger")' },
          { kind: "message", speakerId: "atlas", text: "Found it, two workers can grab the same batch when the lock TTL expires mid-processing. Extending TTL and adding an idempotency check on batch_id.", time: "9:04 AM" },
          { kind: "tool", speakerId: "atlas", text: 'invoked skill: run_tests(suite: "ledger.concurrency", parallel: 500)' },
          { kind: "message", speakerId: "atlas", text: "500 parallel batches, zero duplicates. Opening the change.", time: "9:11 AM" },
          { kind: "message", speakerId: "vibhor", text: "Nice catch. Approved.", time: "9:14 AM" },
        ],
      },
      {
        id: "c2", hash: "7b2d80a", message: "Add idempotency key to refund endpoint", authorId: "rho", time: "3h ago", filesChanged: 1, additions: 18, deletions: 2,
        files: [
          { name: "api/routes/refunds.ts", lines: [
            { type: "context", text: "  export async function createRefund(req) {" },
            { type: "add", text: '+   const key = req.headers["idempotency-key"];' },
            { type: "add", text: "+   const existing = await store.get(key);" },
            { type: "add", text: "+   if (existing) return existing;" },
            { type: "context", text: "    const refund = await processRefund(req.body);" },
          ] },
        ],
        conversation: [
          { kind: "message", speakerId: "div", text: "PAY-142, refunds retried by the client are creating duplicates. Add idempotency handling.", time: "Yesterday, 4:40 PM" },
          { kind: "tool", speakerId: "rho", text: 'invoked skill: search_codebase(query: "refund endpoint duplicate")' },
          { kind: "message", speakerId: "rho", text: "Added an idempotency-key header check backed by the existing key-value store. Opening for review.", time: "Yesterday, 4:58 PM" },
        ],
      },
      {
        id: "c3", hash: "e91a4c2", message: "Add retry backoff to payout worker", authorId: "atlas", time: "1d ago", filesChanged: 1, additions: 9, deletions: 1,
        files: [
          { name: "workers/payout_worker.py", lines: [
            { type: "context", text: "  def run(self):" },
            { type: "remove", text: "-     retry(self.process, times=3)" },
            { type: "add", text: '+     retry(self.process, times=5, backoff="exponential")' },
          ] },
        ],
        conversation: [
          { kind: "message", speakerId: "vibhor", text: "Payout worker keeps failing on transient network errors. Add backoff.", time: "2 days ago" },
          { kind: "message", speakerId: "atlas", text: "Added exponential backoff with 5 retries.", time: "1d ago" },
          { kind: "message", speakerId: "vibhor", text: "Cap the max delay at 30s so we do not stall the queue, otherwise looks good.", time: "1d ago" },
        ],
      },
      {
        id: "c4", hash: "2f5e9b7", message: "Draft batch payout reconciliation report", authorId: "vega", time: "2d ago", filesChanged: 1, additions: 5, deletions: 0,
        files: [
          { name: "docs/reconciliation.md", lines: [
            { type: "add", text: "+ ## Reconciliation report (draft)" },
            { type: "add", text: "+ Explains the batch reconciliation flow end to end." },
          ] },
        ],
        conversation: [
          { kind: "message", speakerId: "vega", text: "Starting a draft of the reconciliation doc based on recent ledger changes.", time: "2d ago" },
        ],
      },
    ],
  },
  {
    id: "design-system", name: "design-system", visibility: "Private", description: "Shared UI components and design tokens", language: "TypeScript", langColor: "#6E88B3", activity: "2h ago", agentIds: ["nova"], trendNote: "18 commits this week",
    commits: [
      {
        id: "d1", hash: "44ab1", message: "Update Button component tokens", authorId: "nova", time: "2h ago", filesChanged: 1, additions: 14, deletions: 6,
        files: [
          { name: "tokens/button.css", lines: [
            { type: "context", text: "  .btn {" },
            { type: "remove", text: "-   padding: 8px 12px;" },
            { type: "add", text: "+   padding: 10px 14px;" },
            { type: "context", text: "  }" },
          ] },
        ],
        conversation: [
          { kind: "message", speakerId: "bob", text: "Buttons feel cramped at the new type scale, can you adjust padding?", time: "1:10 PM" },
          { kind: "message", speakerId: "nova", text: "Bumped padding and re-ran the visual regression suite, all button variants pass.", time: "1:24 PM" },
        ],
      },
      {
        id: "d2", hash: "9c3e2", message: "Add focus-visible ring to Input", authorId: "nova", time: "1d ago", filesChanged: 1, additions: 8, deletions: 0,
        files: [
          { name: "components/Input.tsx", lines: [
            { type: "context", text: "  <input" },
            { type: "add", text: '+   className="focus-visible:ring-2"' },
            { type: "context", text: "  />" },
          ] },
        ],
        conversation: [
          { kind: "message", speakerId: "bob", text: "Keyboard focus is invisible on inputs, accessibility flag from the audit.", time: "Yesterday" },
          { kind: "message", speakerId: "nova", text: "Added a visible focus ring that only shows for keyboard navigation.", time: "Yesterday" },
        ],
      },
    ],
  },
  {
    id: "infra-terraform", name: "infra-terraform", visibility: "Private", description: "Cloud infrastructure as code", language: "HCL", langColor: "#8F87B0", activity: "1d ago", agentIds: ["vega"], trendNote: "9 commits this week",
    commits: [
      {
        id: "i1", hash: "0f1d8", message: "Bump node pool to 3 replicas", authorId: "vega", time: "1d ago", filesChanged: 1, additions: 3, deletions: 3,
        files: [
          { name: "cluster/node_pool.tf", lines: [
            { type: "remove", text: "-   replica_count = 2" },
            { type: "add", text: "+   replica_count = 3" },
          ] },
        ],
        conversation: [
          { kind: "message", speakerId: "vibhor", text: "We are seeing throttling during checkout traffic spikes, scale up the pool.", time: "2d ago" },
          { kind: "message", speakerId: "vega", text: "Scaled to 3 replicas and validated the plan against the staging state file.", time: "1d ago" },
        ],
      },
      {
        id: "i2", hash: "a71bc", message: "Restrict S3 bucket policy to VPC endpoint", authorId: "vega", time: "4d ago", filesChanged: 1, additions: 11, deletions: 2,
        files: [
          { name: "storage/bucket_policy.tf", lines: [
            { type: "context", text: "  statement {" },
            { type: "add", text: '+   condition { test = "StringEquals" }' },
            { type: "context", text: "  }" },
          ] },
        ],
        conversation: [
          { kind: "message", speakerId: "vibhor", text: "Security review flagged the bucket as reachable outside the VPC.", time: "5d ago" },
          { kind: "message", speakerId: "vega", text: "Added a VPC endpoint condition to the bucket policy and confirmed with a plan diff.", time: "4d ago" },
        ],
      },
    ],
  },
  {
    id: "docs-site", name: "docs-site", visibility: "Public", description: "Public developer documentation", language: "MDX", langColor: "#B39B6E", activity: "3d ago", agentIds: ["vega", "juno"], trendNote: "6 commits this week",
    commits: [
      {
        id: "e1", hash: "5d2a9", message: "Add API reference for webhooks", authorId: "juno", time: "2d ago", filesChanged: 1, additions: 60, deletions: 0,
        files: [
          { name: "docs/api/webhooks.mdx", lines: [
            { type: "add", text: "+ ## Webhook events" },
            { type: "add", text: "+ Strand emits a webhook for every commit and review." },
          ] },
        ],
        conversation: [
          { kind: "message", speakerId: "div", text: "We need webhook docs before the beta opens up.", time: "3d ago" },
          { kind: "message", speakerId: "juno", text: "Drafted the reference from the webhook schema and added two payload examples.", time: "2d ago" },
        ],
      },
      {
        id: "e2", hash: "b810f", message: "Fix broken anchor links in quickstart", authorId: "vega", time: "3d ago", filesChanged: 1, additions: 4, deletions: 4,
        files: [
          { name: "docs/quickstart.mdx", lines: [
            { type: "remove", text: "-   [setup](#set-up)" },
            { type: "add", text: "+   [setup](#setup)" },
          ] },
        ],
        conversation: [
          { kind: "message", speakerId: "bob", text: "A few anchor links in quickstart 404.", time: "3d ago" },
          { kind: "message", speakerId: "vega", text: "Fixed the anchors and checked the rest of the doc for broken links.", time: "3d ago" },
        ],
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
