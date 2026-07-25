import { AGENTS } from "../../data/fixtures";

export default function AgentsScreen() {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "36px 44px 44px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <h1 style={{ fontSize: 21, fontWeight: 600, margin: 0 }}>Agents</h1>
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
          + Connect agent
        </button>
      </div>
      <p style={{ fontSize: 13, color: "#8A8A92", margin: "0 0 26px" }}>
        Every agent working across your repositories, with its model, role, and access.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        {AGENTS.map((agent) => {
          const isActive = agent.status === "active";
          return (
            <div key={agent.id} style={{ background: "#131316", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "#303038",
                    border: "1px solid rgba(255,255,255,.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: "none",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#EDEDEF" }}>{agent.initials}</span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#EDEDEF" }}>{agent.name}</div>
                  <div style={{ fontSize: 12, color: "#8A8A92" }}>{agent.role}</div>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: isActive ? "#6FBF83" : "#6C6C74" }}></span>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#8A8A92", marginBottom: 14, fontFamily: "ui-monospace,monospace" }}>{agent.model}</div>
              <div style={{ display: "flex", gap: 18, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#EDEDEF" }}>{agent.repos}</div>
                  <div style={{ fontSize: 11, color: "#6C6C74" }}>repos</div>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#EDEDEF" }}>{agent.commitsWeek}</div>
                  <div style={{ fontSize: 11, color: "#6C6C74" }}>commits/wk</div>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: "#8A8A92" }}>Context used</span>
                  <span style={{ fontSize: 11, color: "#8A8A92" }}>{agent.contextUsed}%</span>
                </div>
                <div style={{ height: 5, background: "rgba(255,255,255,.08)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${agent.contextUsed}%`, height: "100%", background: "#8A8A92" }}></div>
                </div>
              </div>
              <button
                className="hover-btn-outline"
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,.14)",
                  color: "#EDEDEF",
                  borderRadius: 6,
                  padding: 7,
                  fontSize: 12.5,
                  cursor: "pointer",
                }}
              >
                Manage
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
