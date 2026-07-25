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
  name: string;
  lines: DiffLine[];
}

export type ConversationTurnKind = "message" | "tool";

export interface ConversationTurn {
  kind: ConversationTurnKind;
  speakerId: string;
  text: string;
  time?: string;
}

export interface Commit {
  id: string;
  hash: string;
  message: string;
  authorId: string;
  time: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  files: DiffFile[];
  conversation: ConversationTurn[];
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
