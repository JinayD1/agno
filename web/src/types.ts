import type { Decision } from "@orbit/types";

export interface Agent {
  id: string;
  name: string;
  model: string;
  role: string;
  status: "active" | "idle";
  initials: string;
  repos: number;
  commitsWeek: number;
  contextUsed: number;
}

export interface Human {
  id: string;
  name: string;
  role: string;
  initials: string;
  email: string;
}

export type Person = {
  name: string;
  initials: string;
  isAgent: boolean;
};

export type DiffLineType = "context" | "add" | "remove";

export interface DiffLine {
  type: DiffLineType;
  text: string;
}

export interface DiffFile {
  path: string;
  lines: DiffLine[];
}

// Superset of @orbit/types' TraceTurn ({role, content, timestamp}) — adds
// speakerId so the UI can resolve a name/avatar. The contract itself doesn't
// carry per-speaker identity yet (open question for Workstream A/B/C to
// settle), so this is a local-only enrichment layered on top of the frozen
// fields.
export interface Turn {
  role: "human" | "agent" | "tool";
  speakerId: string;
  content: string;
  timestamp: string;
}

// Local UI model for a commit: wraps @orbit/types' OrbitCommit fields plus
// mock-only enrichments (line-level diff, resolved turns) that aren't yet
// part of the frozen contract — GET /api/commits/:id's exact response shape
// is still Workstream A's to define. filesChanged mirrors what the real
// commit object will carry; files/conversation/decisions are local until
// then.
export interface Commit {
  id: string;
  gitSha: string;
  message: string;
  intent: string;
  authorId: string; // agentId, or a human id for human commits
  time: string;
  files: DiffFile[];
  taskDescription: string;
  conversation: Turn[];
  decisions: Decision[];
}

export interface Repo {
  id: string;
  name: string;
  visibility: "Private" | "Public";
  description: string;
  language: string;
  langColor: string;
  activity: string;
  agentIds: string[];
  trendNote: string;
  commits: Commit[];
}

export interface ActivityItem {
  repoName: string;
  authorId: string;
  text: string;
  time: string;
}

export interface Post {
  personId: string;
  text: string;
}

export type SettingsTab = "profile" | "providers" | "org" | "billing";

// ── Repo browser (file tree + viewer) ──────────────────────────────────────

export type CodeLang = "python" | "typescript" | "hcl" | "markdown" | "text";
