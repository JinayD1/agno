import type { TreeNode } from "@orbit/types";
import type { CodeLang } from "../types";

const FILE_CONTENTS: Record<string, string> = {
  "payments-service:services/ledger/reconcile.py": `from strand.locks import acquire_lock
from strand.ledger import is_processed, process_transactions

def reconcile_batch(batch_id):
    lock = acquire_lock(batch_id, ttl=90)
    if is_processed(batch_id):
        return
    process_transactions(batch_id)
    lock.release()
`,
  "payments-service:services/ledger/lock_manager.py": `class LockManager:
    DEFAULT_TTL = 90

    def acquire(self, key, ttl=None):
        return self._store.set_nx(key, ttl or self.DEFAULT_TTL)
`,
  "payments-service:services/README.md": `# services

Core payment processing services. See \`ledger/\` for reconciliation
and locking, \`payout_worker.py\` in \`workers/\` for scheduled payouts.
`,
  "payments-service:workers/payout_worker.py": `class PayoutWorker:
    def run(self):
        retry(self.process, times=5, backoff="exponential", max_delay=30)

    def process(self, payout_id):
        submit_to_bank(payout_id)
`,
  "payments-service:api/routes/refunds.ts": `export async function createRefund(req) {
  const key = req.headers["idempotency-key"];
  const existing = await store.get(key);
  if (existing) return existing;
  const refund = await processRefund(req.body);
  await store.set(key, refund, { ttl: "24h" });
  return refund;
}
`,
  "payments-service:docs/reconciliation.md": `## Reconciliation report (draft)

Explains the batch reconciliation flow end to end.
`,
  "payments-service:package.json": `{
  "name": "payments-service",
  "private": true,
  "type": "module"
}
`,
  "design-system:tokens/button.css": `.btn {
  padding: 10px 14px;
  border-radius: 6px;
  font-weight: 600;
}
`,
  "design-system:tokens/color.css": `:root {
  --bg: #0B0B0D;
  --fg: #EDEDEF;
  --muted: #8A8A92;
}
`,
  "design-system:components/Input.tsx": `export function Input(props) {
  return (
    <input
      {...props}
      className="focus-visible:ring-2"
    />
  );
}
`,
  "design-system:components/Button.tsx": `export function Button({ children, ...props }) {
  return (
    <button className="btn" {...props}>
      {children}
    </button>
  );
}
`,
  "design-system:README.md": `# design-system

Shared UI components and design tokens consumed across Strand's frontends.
`,
  "infra-terraform:cluster/node_pool.tf": `resource "google_container_node_pool" "primary" {
  name           = "primary"
  cluster        = google_container_cluster.strand.name
  replica_count  = 3
}
`,
  "infra-terraform:storage/bucket_policy.tf": `resource "aws_s3_bucket_policy" "assets" {
  bucket = aws_s3_bucket.assets.id
  policy = jsonencode({
    Statement = [{
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      condition { test = "StringEquals" }
    }]
  })
}
`,
  "infra-terraform:main.tf": `terraform {
  required_version = ">= 1.6.0"
}

provider "aws" {
  region = "us-east-1"
}
`,
  "infra-terraform:README.md": `# infra-terraform

Cloud infrastructure as code for Strand's production environment.
`,
  "docs-site:docs/api/webhooks.mdx": `## Webhook events

Strand emits a webhook for every commit and review.
`,
  "docs-site:docs/quickstart.mdx": `# Quickstart

See [setup](#setup) to connect your first repository.
`,
  "docs-site:README.md": `# docs-site

Public developer documentation, built and deployed from this repo.
`,
};

// Flat node lists — exactly the shape GET /api/repos/:id/tree?ref= returns
// (ReadTreeResponse.nodes, @orbit/types). Only files are listed; directories
// are inferred from paths by buildUiTree, same as a real client would do.
export const FILE_TREE_NODES: Record<string, TreeNode[]> = {
  "payments-service": [
    "services/ledger/reconcile.py",
    "services/ledger/lock_manager.py",
    "services/README.md",
    "workers/payout_worker.py",
    "api/routes/refunds.ts",
    "docs/reconciliation.md",
    "package.json",
  ].map((path) => ({ path, type: "file", size: FILE_CONTENTS[`payments-service:${path}`]?.length })),
  "design-system": [
    "tokens/button.css",
    "tokens/color.css",
    "components/Input.tsx",
    "components/Button.tsx",
    "README.md",
  ].map((path) => ({ path, type: "file", size: FILE_CONTENTS[`design-system:${path}`]?.length })),
  "infra-terraform": [
    "cluster/node_pool.tf",
    "storage/bucket_policy.tf",
    "main.tf",
    "README.md",
  ].map((path) => ({ path, type: "file", size: FILE_CONTENTS[`infra-terraform:${path}`]?.length })),
  "docs-site": [
    "docs/api/webhooks.mdx",
    "docs/quickstart.mdx",
    "README.md",
  ].map((path) => ({ path, type: "file", size: FILE_CONTENTS[`docs-site:${path}`]?.length })),
};

export function langForPath(path: string): CodeLang {
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".ts") || path.endsWith(".tsx") || path.endsWith(".css")) return "typescript";
  if (path.endsWith(".tf")) return "hcl";
  if (path.endsWith(".md") || path.endsWith(".mdx")) return "markdown";
  return "text";
}

export function fileContent(repoId: string, path: string): string {
  return FILE_CONTENTS[`${repoId}:${path}`] ?? "";
}

export function firstFilePath(repoId: string): string | null {
  const nodes = FILE_TREE_NODES[repoId];
  if (!nodes || nodes.length === 0) return null;
  return [...nodes].sort((a, b) => a.path.localeCompare(b.path))[0]!.path;
}
