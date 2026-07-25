import { nanoid } from "nanoid";

// Prefixed IDs per PRD §4.1 ("agent_<nanoid>", "commit_<nanoid>", ...).
const mint = (prefix: string) => `${prefix}_${nanoid()}`;

export const newRepoId = () => mint("repo");
export const newAgentId = () => mint("agent");
export const newCommitId = () => mint("commit");
export const newTraceId = () => mint("trace");
export const newContextId = () => mint("ctx");
export const newSessionId = () => mint("session");
