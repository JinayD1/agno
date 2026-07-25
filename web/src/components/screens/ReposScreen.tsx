import { useNavigate } from "react-router-dom";
import { REPOS, agentById } from "../../data/fixtures";
import Avatar from "../Avatar";

export default function ReposScreen() {
  const navigate = useNavigate();

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "36px 44px 44px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 600, margin: "0 0 4px" }}>Repositories</h1>
          <p style={{ fontSize: 13, color: "#8A8A92", margin: 0 }}>{REPOS.length} repositories</p>
        </div>
        <button
          className="hover-btn-primary"
          style={{
            background: "#EDEDEF",
            color: "#0B0B0D",
            border: "none",
            borderRadius: 6,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + New repository
        </button>
      </div>
      <div style={{ background: "#131316", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10, overflow: "hidden" }}>
        {REPOS.map((repo) => (
          <div
            key={repo.id}
            onClick={() => navigate(`/repos/${repo.id}`)}
            className="hover-row"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "16px 18px",
              borderBottom: "1px solid rgba(255,255,255,.06)",
              cursor: "pointer",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#EDEDEF" }}>{repo.name}</span>
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
              <div style={{ fontSize: 12.5, color: "#8A8A92" }}>{repo.description}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, width: 120, flex: "none" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: repo.langColor }}></span>
              <span style={{ fontSize: 12, color: "#8A8A92" }}>{repo.language}</span>
            </div>
            <div style={{ display: "flex", width: 64, flex: "none" }}>
              {repo.agentIds.map((agentId) => {
                const agent = agentById(agentId)!;
                return (
                  <Avatar
                    key={agentId}
                    person={{ name: agent.name, initials: agent.initials, isAgent: true }}
                    size={22}
                    agentRadius={6}
                    fontSize={9}
                    style={{ marginLeft: -6 }}
                  />
                );
              })}
            </div>
            <div style={{ fontSize: 12, color: "#6C6C74", width: 80, textAlign: "right", flex: "none" }}>{repo.activity}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
