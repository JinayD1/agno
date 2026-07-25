import { useState } from "react";
import { HUMANS, humanById } from "../../data/fixtures";
import type { SettingsTab } from "../../types";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "providers", label: "Model providers" },
  { id: "org", label: "Organization" },
  { id: "billing", label: "Billing" },
];

function Toggle() {
  return (
    <div style={{ width: 36, height: 20, borderRadius: 10, background: "#3A3A40", padding: 2, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#EDEDEF" }}></div>
    </div>
  );
}

export default function SettingsScreen() {
  const [tab, setTab] = useState<SettingsTab>("profile");
  const you = humanById("div")!;

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <div style={{ width: 200, flex: "none", padding: "36px 0 0 44px" }}>
        <h1 style={{ fontSize: 21, fontWeight: 600, margin: "0 0 24px" }}>Settings</h1>
        {TABS.map((t) => (
          <div
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
              color: tab === t.id ? "#EDEDEF" : "#9A9AA2",
              background: tab === t.id ? "rgba(255,255,255,.07)" : "transparent",
              marginBottom: 2,
            }}
          >
            {t.label}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "36px 44px", maxWidth: 640 }}>
        {tab === "profile" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: "#2A2A30",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ fontSize: 18, fontWeight: 600, color: "#EDEDEF" }}>{you.initials}</span>
              </div>
              <button
                className="hover-btn-outline"
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,.14)",
                  color: "#EDEDEF",
                  borderRadius: 6,
                  padding: "7px 14px",
                  fontSize: 12.5,
                  cursor: "pointer",
                }}
              >
                Change avatar
              </button>
            </div>
            <div style={{ background: "#131316", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10, padding: 18, marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: "#8A8A92", display: "block", marginBottom: 6 }}>Name</label>
              <input
                readOnly
                value={you.name}
                style={{
                  width: "100%",
                  background: "#0D0D10",
                  border: "1px solid rgba(255,255,255,.1)",
                  borderRadius: 6,
                  padding: "8px 10px",
                  color: "#EDEDEF",
                  fontSize: 13,
                  marginBottom: 14,
                }}
              />
              <label style={{ fontSize: 12, color: "#8A8A92", display: "block", marginBottom: 6 }}>Email</label>
              <input
                readOnly
                value={you.email}
                style={{
                  width: "100%",
                  background: "#0D0D10",
                  border: "1px solid rgba(255,255,255,.1)",
                  borderRadius: 6,
                  padding: "8px 10px",
                  color: "#EDEDEF",
                  fontSize: 13,
                }}
              />
            </div>
            <div
              style={{
                background: "#131316",
                border: "1px solid rgba(255,255,255,.07)",
                borderRadius: 10,
                padding: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: "#EDEDEF", marginBottom: 2 }}>Two-factor authentication</div>
                <div style={{ fontSize: 12, color: "#8A8A92" }}>Add an extra layer of security</div>
              </div>
              <Toggle />
            </div>
          </>
        )}

        {tab === "providers" && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#EDEDEF", marginBottom: 12 }}>Model providers</div>
            <div style={{ background: "#131316", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                <span style={{ fontSize: 13, color: "#EDEDEF", flex: 1 }}>Anthropic</span>
                <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 12, color: "#6C6C74" }}>sk-ant-••••••••1a2b</span>
                <span style={{ fontSize: 11, color: "#6FBF83", background: "rgba(111,191,131,.12)", borderRadius: 4, padding: "2px 8px" }}>
                  Connected
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                <span style={{ fontSize: 13, color: "#EDEDEF", flex: 1 }}>OpenAI</span>
                <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 12, color: "#6C6C74" }}>sk-••••••••9f3c</span>
                <span style={{ fontSize: 11, color: "#6FBF83", background: "rgba(111,191,131,.12)", borderRadius: 4, padding: "2px 8px" }}>
                  Connected
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
                <span style={{ fontSize: 13, color: "#EDEDEF", flex: 1 }}>Google</span>
                <span style={{ fontSize: 12, color: "#54545A" }}>Not connected</span>
                <button
                  className="hover-btn-outline"
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,.14)",
                    color: "#EDEDEF",
                    borderRadius: 6,
                    padding: "5px 12px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Connect
                </button>
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#EDEDEF", marginBottom: 12 }}>Default review policy</div>
            <div
              style={{
                background: "#131316",
                border: "1px solid rgba(255,255,255,.07)",
                borderRadius: 10,
                padding: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: "#EDEDEF", marginBottom: 2 }}>Require human review before merge</div>
                <div style={{ fontSize: 12, color: "#8A8A92" }}>Applies to new repositories by default</div>
              </div>
              <Toggle />
            </div>
          </>
        )}

        {tab === "org" && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#EDEDEF", marginBottom: 12 }}>Members</div>
            <div style={{ background: "#131316", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10, overflow: "hidden" }}>
              {HUMANS.map((human) => (
                <div
                  key={human.id}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: "1px solid rgba(255,255,255,.06)" }}
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
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#EDEDEF" }}>{human.initials}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: "#EDEDEF" }}>{human.name}</div>
                    <div style={{ fontSize: 11.5, color: "#8A8A92" }}>{human.email}</div>
                  </div>
                  <span
                    style={{
                      fontSize: 11.5,
                      color: "#8A8A92",
                      border: "1px solid rgba(255,255,255,.14)",
                      borderRadius: 5,
                      padding: "3px 9px",
                    }}
                  >
                    {human.role}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "billing" && (
          <>
            <div style={{ background: "#131316", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10, padding: 18, marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#EDEDEF" }}>Team plan</div>
                  <div style={{ fontSize: 12, color: "#8A8A92" }}>$49/mo per seat, agent compute metered separately</div>
                </div>
                <button
                  className="hover-btn-outline"
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,.14)",
                    color: "#EDEDEF",
                    borderRadius: 6,
                    padding: "7px 14px",
                    fontSize: 12.5,
                    cursor: "pointer",
                  }}
                >
                  Change plan
                </button>
              </div>
              <div style={{ fontSize: 12, color: "#8A8A92", marginBottom: 6 }}>Agent compute, 340 of 500 hrs used this month</div>
              <div style={{ height: 6, background: "rgba(255,255,255,.08)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: "68%", height: "100%", background: "#8A8A92" }}></div>
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#EDEDEF", marginBottom: 12 }}>Invoices</div>
            <div style={{ background: "#131316", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "flex", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.06)", fontSize: 12.5, color: "#8A8A92" }}>
                <span style={{ flex: 1 }}>Jun 2026</span>
                <span style={{ flex: 1 }}>$412.00</span>
                <span style={{ color: "#6FBF83" }}>Paid</span>
              </div>
              <div style={{ display: "flex", padding: "12px 16px", fontSize: 12.5, color: "#8A8A92" }}>
                <span style={{ flex: 1 }}>May 2026</span>
                <span style={{ flex: 1 }}>$389.00</span>
                <span style={{ color: "#6FBF83" }}>Paid</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
