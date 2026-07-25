import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { REPOS, resolvePerson, lineStyle } from "../../data/fixtures";
import Avatar from "../Avatar";

export default function RepoDetailScreen() {
  const { repoId } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const repo = REPOS.find((r) => r.id === repoId) ?? REPOS[0];

  const [selectedCommitId, setSelectedCommitId] = useState<string>(repo.commits[0]?.id ?? "");

  useEffect(() => {
    setSelectedCommitId(repo.commits[0]?.id ?? "");
  }, [repo.id]);

  const selectedCommit = repo.commits.find((c) => c.id === selectedCommitId) ?? repo.commits[0];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
      <div style={{ padding: "24px 32px 16px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        <div
          onClick={() => navigate("/repos")}
          className="hover-bright"
          style={{ fontSize: 12.5, color: "#8A8A92", cursor: "pointer", marginBottom: 14, display: "inline-block" }}
        >
          ← Repositories
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
          <h1 style={{ fontSize: 19, fontWeight: 600, margin: 0 }}>{repo.name}</h1>
          <span
            style={{
              fontSize: 10.5,
              color: "#8A8A92",
              border: "1px solid rgba(255,255,255,.14)",
              borderRadius: 4,
              padding: "1px 6px",
            }}
          >
            {repo.visibility}
          </span>
        </div>
        <p style={{ fontSize: 13, color: "#8A8A92", margin: 0 }}>{repo.description}</p>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0, overflowX: "auto" }}>
        <div style={{ width: 240, flex: "none", borderRight: "1px solid rgba(255,255,255,.08)", overflowY: "auto", padding: 10 }}>
          {repo.commits.map((commit) => {
            const author = resolvePerson(commit.authorId);
            const isSelected = commit.id === selectedCommit.id;
            return (
              <div
                key={commit.id}
                onClick={() => setSelectedCommitId(commit.id)}
                className={isSelected ? "" : "hover-row"}
                style={{
                  padding: "11px 10px",
                  borderRadius: 8,
                  cursor: "pointer",
                  marginBottom: 2,
                  background: isSelected ? "rgba(255,255,255,.06)" : "transparent",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                  <Avatar person={author} size={18} agentRadius={5} fontSize={8.5} />
                  <span style={{ fontSize: 12, color: "#8A8A92" }}>{author.name}</span>
                  <span style={{ fontSize: 11, color: "#54545A", marginLeft: "auto" }}>{commit.time}</span>
                </div>
                <div style={{ fontSize: 12.5, color: "#EDEDEF", marginBottom: 6, lineHeight: 1.35 }}>{commit.message}</div>
                <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 11, color: "#54545A" }}>{commit.hash}</span>
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1, minWidth: 340, borderRight: "1px solid rgba(255,255,255,.08)", overflowY: "auto", padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 12.5, color: "#8A8A92" }}>{selectedCommit.filesChanged} files changed</span>
            <span style={{ fontSize: 12.5, color: "#8FBF9F" }}>+{selectedCommit.additions}</span>
            <span style={{ fontSize: 12.5, color: "#C98F8B" }}>−{selectedCommit.deletions}</span>
          </div>
          {selectedCommit.files.map((file, fi) => (
            <div key={fi} style={{ marginBottom: 16, border: "1px solid rgba(255,255,255,.07)", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ background: "#18181C", padding: "8px 12px", fontFamily: "ui-monospace,monospace", fontSize: 12, color: "#C7C7CC" }}>
                {file.name}
              </div>
              <div style={{ padding: "8px 0" }}>
                {file.lines.map((line, li) => {
                  const s = lineStyle(line);
                  return (
                    <div
                      key={li}
                      style={{
                        fontFamily: "ui-monospace,monospace",
                        fontSize: 12,
                        padding: "2px 12px",
                        whiteSpace: "pre",
                        background: s.bg,
                        color: s.color,
                      }}
                    >
                      {line.text}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ width: 300, flex: "none", display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#EDEDEF" }}>Conversation</div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
            {selectedCommit.conversation.map((turn, ti) => {
              if (turn.kind === "tool") {
                const speaker = resolvePerson(turn.speakerId);
                return (
                  <div key={ti} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "2px 0 12px 31px" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#6C6C74", flex: "none" }}></span>
                    <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 11.5, color: "#6C6C74" }}>
                      <strong style={{ color: "#8A8A92", fontWeight: 500 }}>{speaker.name}</strong> {turn.text}
                    </span>
                  </div>
                );
              }
              const speaker = resolvePerson(turn.speakerId);
              return (
                <div key={ti} style={{ display: "flex", gap: 9, marginBottom: 14 }}>
                  <Avatar person={speaker} size={22} agentRadius={7} fontSize={9.5} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#EDEDEF" }}>{speaker.name}</span>
                      <span style={{ fontSize: 10.5, color: "#54545A" }}>{turn.time}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: "#C7C7CC", lineHeight: 1.45 }}>{turn.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
