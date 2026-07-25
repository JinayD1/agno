import { useNavigate } from "react-router-dom";
import { ACTIVITY, POSTS, REPOS, humanById, resolvePerson } from "../../data/fixtures";
import Avatar from "../Avatar";

export default function HomeScreen() {
  const navigate = useNavigate();
  const you = humanById("div")!;
  const trending = REPOS.slice(0, 2);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "36px 44px 44px" }}>
      <h1 style={{ fontSize: 21, fontWeight: 600, margin: "0 0 4px" }}>Home</h1>
      <p style={{ fontSize: 13, color: "#8A8A92", margin: "0 0 28px" }}>Good to see you, {you.name}.</p>

      <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
        <div style={{ flex: 1.7, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#EDEDEF", marginBottom: 14 }}>Recent activity</div>
          <div>
            {ACTIVITY.map((item, i) => {
              const p = resolvePerson(item.authorId);
              return (
                <div
                  key={i}
                  style={{ display: "flex", gap: 12, padding: "16px 0", borderBottom: "1px solid rgba(255,255,255,.07)" }}
                >
                  <Avatar person={p} size={30} agentRadius={8} fontSize={11} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: "#D6D6DA", lineHeight: 1.45 }}>
                      <strong style={{ color: "#EDEDEF", fontWeight: 600 }}>{p.name}</strong> {item.text}
                    </div>
                    <div style={{ fontSize: 12, color: "#6C6C74", marginTop: 4 }}>
                      {item.repoName} · {item.time}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0, maxWidth: 320 }}>
          <div style={{ marginBottom: 26 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#8A8A92", letterSpacing: ".03em", marginBottom: 10 }}>
              TRENDING
            </div>
            <div style={{ background: "#131316", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10, overflow: "hidden" }}>
              {trending.map((repo) => (
                <div
                  key={repo.id}
                  onClick={() => navigate(`/repos/${repo.id}`)}
                  className="hover-row"
                  style={{ padding: "11px 14px", borderBottom: "1px solid rgba(255,255,255,.06)", cursor: "pointer" }}
                >
                  <div style={{ fontSize: 12.5, color: "#EDEDEF", marginBottom: 2 }}>{repo.name}</div>
                  <div style={{ fontSize: 11.5, color: "#6C6C74" }}>{repo.trendNote}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#8A8A92", letterSpacing: ".03em", marginBottom: 10 }}>
              UPDATES
            </div>
            <div style={{ background: "#131316", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10, overflow: "hidden" }}>
              {POSTS.map((post, i) => {
                const h = humanById(post.personId)!;
                return (
                  <div key={i} style={{ display: "flex", gap: 9, padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: "#2A2A30",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flex: "none",
                      }}
                    >
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: "#EDEDEF" }}>{h.initials}</span>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "#EDEDEF", fontWeight: 600, marginBottom: 2 }}>{h.name}</div>
                      <div style={{ fontSize: 12, color: "#9A9AA2", lineHeight: 1.4 }}>{post.text}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
