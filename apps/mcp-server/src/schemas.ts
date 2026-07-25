/**
 * Client-side validation for `orbit_commit`'s `intent` + `trace` arguments.
 *
 * `trace` mirrors `ConversationTrace` (PRD §4.1: task, turns, decisions) but is
 * validated here, ahead of the wire, so an empty or malformed trace comes back
 * as one clean INVALID_INPUT error instead of a round trip through A (Task 3 DoD).
 */

import { z } from "zod";

export const TRACE_TURN_ROLES = ["human", "agent", "tool"] as const;

export const traceTurnSchema = z.object({
  role: z.enum(TRACE_TURN_ROLES),
  content: z
    .string()
    .trim()
    .min(1, "turns[].content must not be empty")
    .max(4000, "turns[].content exceeds the 4000 char limit"),
  timestamp: z
    .string()
    .min(1, "turns[].timestamp is required")
    .refine((v) => !Number.isNaN(Date.parse(v)), "turns[].timestamp must be a valid ISO 8601 date string"),
});

export const decisionSchema = z.object({
  question: z.string().trim().min(1, "decisions[].question must not be empty"),
  chosen: z.string().trim().min(1, "decisions[].chosen must not be empty"),
  rejected: z.array(z.string().trim().min(1)).default([]),
  reasoning: z.string().trim().min(1, "decisions[].reasoning must not be empty"),
});

/** Matches `CreateTraceInput` from @orbit/types, with "reject empty traces" enforced. */
export const traceInputSchema = z.object({
  taskDescription: z.string().trim().min(1, "trace.taskDescription is required"),
  turns: z.array(traceTurnSchema).min(1, "trace.turns must include at least one turn"),
  decisions: z.array(decisionSchema).default([]),
});

export const commitFileSchema = z.object({
  path: z
    .string()
    .trim()
    .min(1, "files[].path must not be empty")
    .refine((p) => !p.startsWith("/"), "files[].path must be repo-relative (no leading '/')"),
  content: z.string(),
});

/** Full strict schema for `orbit_commit` args (§6: intent required, trace validated). */
export const commitArgsSchema = z.object({
  repoId: z.string().trim().min(1).optional(),
  files: z.array(commitFileSchema).min(1, "at least one file is required"),
  message: z.string().trim().min(1, "message is required"),
  intent: z
    .string()
    .trim()
    .min(1, "intent is required for agent commits")
    .max(500, "intent should be a one-line summary (max 500 chars)"),
  trace: traceInputSchema,
});

export type CommitArgs = z.infer<typeof commitArgsSchema>;

/** Flatten zod issues into one readable line, e.g. `trace.turns: ...; intent: ...`. */
export function formatZodIssues(error: z.ZodError): string {
  return error.issues.map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message)).join("; ");
}

/**
 * Client-side validation for `orbit_publish_context`'s args (PRD §4.1
 * `ContextPacket` / §6 Task 4). Mirrors `commitArgsSchema`'s pattern: catch
 * malformed packets here so they come back as one clean INVALID_INPUT tool
 * error instead of a round trip through A.
 */
export const CONTEXT_PACKET_TYPES = ["constraint", "failed_approach", "open_thread", "discovery", "handoff"] as const;

export const publishContextArgsSchema = z.object({
  repoId: z.string().trim().min(1).optional(),
  type: z.enum(CONTEXT_PACKET_TYPES),
  title: z.string().trim().min(1, "title is required").max(120, "title exceeds the 120 char limit"),
  body: z.string().trim().min(1, "body is required").max(8000, "body exceeds the 8000 char limit"),
  relatedPaths: z.array(z.string().trim().min(1, "relatedPaths[] entries must not be empty")).default([]),
  supersedes: z.string().trim().min(1).nullable().optional(),
  expiresAt: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional()
    .refine((v) => v == null || !Number.isNaN(Date.parse(v)), "expiresAt must be a valid ISO 8601 date string or null"),
});

export type PublishContextArgs = z.infer<typeof publishContextArgsSchema>;
