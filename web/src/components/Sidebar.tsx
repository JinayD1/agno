import { useLocation, useNavigate } from "react-router-dom";
import { REPOS, humanById } from "../data/fixtures";

const navTextColor = (active: boolean) => (active ? "#EDEDEF" : "#9A9AA2");
const navIconColor = (active: boolean) => (active ? "#EDEDEF" : "#8A8A92");
const navWeight = (active: boolean) => (active ? 500 : 400);

function NavItem({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: (color: string) => JSX.Element;
  label: string;
}) {
  return (
    <div
      onClick={onClick}
      className="hover-surface"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 8px",
        borderRadius: 6,
        cursor: "pointer",
        position: "relative",
        marginTop: 2,
      }}
    >
      {active && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(255,255,255,.07)",
            borderRadius: 6,
          }}
        />
      )}
      <span style={{ position: "relative", flex: "none", display: "flex" }}>{icon(navIconColor(active))}</span>
      <span
        style={{
          position: "relative",
          fontSize: 13,
          color: navTextColor(active),
          fontWeight: navWeight(active),
        }}
      >
        {label}
      </span>
    </div>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const isHome = location.pathname === "/";
  const isRepos = location.pathname.startsWith("/repos");
  const isAgents = location.pathname.startsWith("/agents");
  const isSettings = location.pathname.startsWith("/settings");

  const you = humanById("div")!;

  return (
    <div
      style={{
        width: 224,
        flex: "none",
        display: "flex",
        flexDirection: "column",
        background: "#0D0D10",
        borderRight: "1px solid rgba(255,255,255,.08)",
        padding: "14px 10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 6px 14px 6px" }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: "#EDEDEF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
          }}
        >
          <span style={{ color: "#0B0B0D", fontWeight: 700, fontSize: 12 }}>S</span>
        </div>
        <span style={{ fontWeight: 600, fontSize: 14, color: "#EDEDEF" }}>Strand</span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "#151518",
          border: "1px solid rgba(255,255,255,.06)",
          borderRadius: 6,
          padding: "7px 9px",
          marginBottom: 14,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#6C6C74" strokeWidth={1.6}>
          <circle cx="9" cy="9" r="5.3"></circle>
          <line x1="13" y1="13" x2="17" y2="17" strokeLinecap="round"></line>
        </svg>
        <span style={{ fontSize: 12.5, color: "#6C6C74" }}>Search</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#4A4A50", fontFamily: "ui-monospace,monospace" }}>
          ⌘K
        </span>
      </div>

      <NavItem
        active={isHome}
        onClick={() => navigate("/")}
        label="Home"
        icon={(color) => (
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" strokeWidth={1.5}>
            <path d="M3 9.5L10 3l7 6.5" stroke={color} strokeLinecap="round" strokeLinejoin="round"></path>
            <path d="M5 8.3V17h10V8.3" stroke={color} strokeLinecap="round" strokeLinejoin="round"></path>
          </svg>
        )}
      />

      <NavItem
        active={isRepos}
        onClick={() => navigate("/repos")}
        label="Repositories"
        icon={(color) => (
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M3 6h5.2l1.4 1.8H17V16H3z" stroke={color} strokeWidth={1.5} strokeLinejoin="round"></path>
          </svg>
        )}
      />

      <NavItem
        active={isAgents}
        onClick={() => navigate("/agents")}
        label="Agents"
        icon={(color) => (
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="6.4" r="3" stroke={color} strokeWidth={1.5}></circle>
            <rect x="6" y="11" width="8" height="6" rx="2" stroke={color} strokeWidth={1.5}></rect>
            <circle cx="8.4" cy="6.3" r="0.7" fill={color}></circle>
            <circle cx="11.6" cy="6.3" r="0.7" fill={color}></circle>
          </svg>
        )}
      />

      <div style={{ fontSize: 10.5, letterSpacing: ".06em", color: "#54545A", fontWeight: 600, padding: "18px 8px 6px" }}>
        REPOSITORIES
      </div>
      {REPOS.map((repo) => (
        <div
          key={repo.id}
          onClick={() => navigate(`/repos/${repo.id}`)}
          className="hover-surface"
          style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px", borderRadius: 6, cursor: "pointer" }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: repo.langColor, flex: "none" }}></span>
          <span
            style={{
              fontSize: 12.5,
              color: "#9A9AA2",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {repo.name}
          </span>
        </div>
      ))}

      <div style={{ flex: 1 }}></div>

      <NavItem
        active={isSettings}
        onClick={() => navigate("/settings")}
        label="Settings"
        icon={(color) => (
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <line x1="4" y1="6" x2="16" y2="6" stroke={color} strokeWidth={1.5} strokeLinecap="round"></line>
            <circle cx="12" cy="6" r="1.8" fill="#0D0D10" stroke={color} strokeWidth={1.5}></circle>
            <line x1="4" y1="10.5" x2="16" y2="10.5" stroke={color} strokeWidth={1.5} strokeLinecap="round"></line>
            <circle cx="7" cy="10.5" r="1.8" fill="#0D0D10" stroke={color} strokeWidth={1.5}></circle>
            <line x1="4" y1="15" x2="16" y2="15" stroke={color} strokeWidth={1.5} strokeLinecap="round"></line>
            <circle cx="13" cy="15" r="1.8" fill="#0D0D10" stroke={color} strokeWidth={1.5}></circle>
          </svg>
        )}
      />

      <div
        onClick={() => navigate("/settings")}
        className="hover-surface"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: 8,
          borderRadius: 6,
          cursor: "pointer",
          borderTop: "1px solid rgba(255,255,255,.06)",
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "#2A2A30",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: "#EDEDEF" }}>{you.initials}</span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 12.5,
              color: "#EDEDEF",
              fontWeight: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {you.name}
          </div>
          <div style={{ fontSize: 11, color: "#6C6C74" }}>{you.role}</div>
        </div>
      </div>
    </div>
  );
}
