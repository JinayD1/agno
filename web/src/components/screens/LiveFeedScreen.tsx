import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AgentSession, OrbitEvent } from "@orbit/types";
import { getAllSessions, getInitialEvents, subscribeEvents } from "../../api/mockApi";
import { REPOS, agentById, resolvePerson } from "../../data/fixtures";
import { relativeTime } from "../../utils/relativeTime";
import Avatar from "../Avatar";

function eventTimestamp(e: OrbitEvent): string {
  switch (e.type) {
    case "commit.created":
    case "context.published":
      return e.payload.createdAt;
    case "session.started":
      return e.payload.startedAt;
    case "session.updated":
      return e.payload.lastHeartbeat;
    default:
      return new Date().toISOString();
  }
}

function eventActorId(e: OrbitEvent): string | null {
  switch (e.type) {
    case "commit.created":
      return e.payload.agentId;
    case "context.published":
    case "session.started":
    case "session.updated":
      return e.payload.agentId;
    default:
      return null;
  }
}

function eventText(e: OrbitEvent): string {
  const repoName = (id: string) => REPOS.find((r) => r.id === id)?.name ?? id;
  switch (e.type) {
    case "commit.created":
      return `committed "${e.payload.message}" to ${repoName(e.payload.repoId)}`;
    case "context.published":
      return `published a ${e.payload.type.replace("_", " ")} packet: "${e.payload.title}"`;
    case "session.started":
      return `started a session on ${repoName(e.payload.repoId)}`;
    case "session.updated":
      return e.payload.currentTask ? `is working on: ${e.payload.currentTask}` : "sent a heartbeat";
    case "session.ended":
      return "ended their session";
    case "context.retracted":
      return "retracted a context packet";
  }
}

export default function LiveFeedScreen() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [events, setEvents] = useState<OrbitEvent[]>([]);
  const [, setClockTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getAllSessions().then((s) => !cancelled && setSessions(s));
    getInitialEvents().then((e) => !cancelled && setEvents(e));
    const unsubscribe = subscribeEvents((s, e) => {
      if (cancelled) return;
      setSessions(s);
      setEvents(e);
    });
    const clock = setInterval(() => setClockTick((t) => t + 1), 1000);
    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(clock);
    };
  }, []);

  const recentCommitsFor = (agentId: string) =>
    REPOS.flatMap((r) => r.commits.filter((c) => c.authorId === agentId).map((c) => ({ ...c, repoId: r.id }))).slice(0, 2);

  const timeline = [...events].reverse().slice(0, 14);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "36px 44px 44px" }}>
      <h1 style={{ fontSize: 21, fontWeight: 600, margin: "0 0 4px" }}>Live Feed</h1>
      <p style={{ fontSize: 13, color: "#8A8A92", margin: "0 0 28px" }}>
        Active agent sessions across your repositories, updated in real time.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 36 }}>
        {sessions.map((session) => {
          const agent = agentById(session.agentId);
          if (!agent) return null;
          const person = { name: agent.name, initials: agent.initials, isAgent: true };
          const isActive = session.status === "active";
          const repo = REPOS.find((r) => r.id === session.repoId);
          const commits = recentCommitsFor(session.agentId);

          return (
            <div key={session.id} style={{ background: "#131316", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <Avatar person={person} size={36} agentRadius={10} fontSize={13} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#EDEDEF" }}>{agent.name}</div>
                  <div style={{ fontSize: 11.5, color: "#8A8A92", fontFamily: "ui-monospace,monospace" }}>{agent.model}</div>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
                  <span className={isActive ? "pulse-dot" : ""} style={{ width: 6, height: 6, borderRadius: "50%", background: isActive ? "#6FBF83" : "#6C6C74" }}></span>
                  <span style={{ fontSize: 11, color: "#8A8A92" }}>{isActive ? "Active" : "Idle"}</span>
                </div>
              </div>

              {repo && (
                <div
                  onClick={() => navigate(`/repos/${repo.id}`)}
                  className="hover-bright"
                  style={{ fontSize: 11.5, color: "#8A8A92", cursor: "pointer", marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: repo.langColor }}></span>
                  {repo.name}
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10.5, letterSpacing: ".04em", color: "#8A8A92", fontWeight: 600, marginBottom: 6 }}>CURRENT TASK</div>
                <div style={{ fontSize: 12.5, color: session.currentTask ? "#C7C7CC" : "#6C6C74", lineHeight: 1.4 }}>
                  {session.currentTask ?? "No active task"}
                </div>
              </div>

              {commits.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10.5, letterSpacing: ".04em", color: "#8A8A92", fontWeight: 600, marginBottom: 6 }}>RECENT COMMITS</div>
                  {commits.map((c) => (
                    <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 3 }}>
                      <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 10.5, color: "#54545A", flex: "none" }}>{c.gitSha.slice(0, 7)}</span>
                      <span style={{ fontSize: 11.5, color: "#8A8A92", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {c.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ fontSize: 11, color: "#54545A" }}>Last heartbeat: {relativeTime(session.lastHeartbeat)}</div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: "#EDEDEF", marginBottom: 14 }}>Timeline</div>
      <div style={{ background: "#131316", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10, overflow: "hidden" }}>
        {timeline.map((e, i) => {
          const actorId = eventActorId(e);
          const person = actorId ? resolvePerson(actorId) : null;
          return (
            <div key={i} style={{ display: "flex", gap: 10, padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
              {person ? (
                <Avatar person={person} size={22} agentRadius={6} fontSize={9.5} />
              ) : (
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#2A2A30", flex: "none" }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: "#C7C7CC" }}>
                  {person && <strong style={{ color: "#EDEDEF", fontWeight: 600 }}>{person.name} </strong>}
                  {eventText(e)}
                </div>
                <div style={{ fontSize: 11, color: "#6C6C74", marginTop: 2 }}>{relativeTime(eventTimestamp(e))}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
