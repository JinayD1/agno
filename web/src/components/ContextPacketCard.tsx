import type { ContextPacket } from "@orbit/types";
import { CONTEXT_PACKET_TYPE_LABEL } from "../data/contextPackets";
import { resolvePerson } from "../data/fixtures";
import { relativeTime } from "../utils/relativeTime";

const TYPE_GLYPH: Record<ContextPacket["type"], string> = {
  constraint: "C",
  failed_approach: "F",
  open_thread: "O",
  discovery: "D",
  handoff: "H",
};

interface ContextPacketCardProps {
  packet: ContextPacket;
  supersededBy?: ContextPacket;
  onRetract?: (id: string) => void;
  compact?: boolean;
}

export default function ContextPacketCard({ packet, supersededBy, onRetract, compact }: ContextPacketCardProps) {
  const author = resolvePerson(packet.agentId);
  const isStale = !!supersededBy;

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,.07)",
        borderRadius: 8,
        padding: compact ? "10px 12px" : "14px 16px",
        marginBottom: 10,
        opacity: isStale ? 0.55 : 1,
        background: "#131316",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: "#303038",
            border: "1px solid rgba(255,255,255,.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 700, color: "#EDEDEF" }}>{TYPE_GLYPH[packet.type]}</span>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 10.5, letterSpacing: ".04em", color: "#8A8A92", fontWeight: 600 }}>
              {CONTEXT_PACKET_TYPE_LABEL[packet.type].toUpperCase()}
            </span>
            <span style={{ fontSize: 10.5, color: "#54545A" }}>{relativeTime(packet.createdAt)}</span>
          </div>
          <div
            style={{
              fontSize: 13,
              color: "#EDEDEF",
              fontWeight: 600,
              marginTop: 2,
              textDecoration: isStale ? "line-through" : "none",
              textDecorationColor: "#54545A",
            }}
          >
            {packet.title}
          </div>
        </div>
        {onRetract && (
          <button
            onClick={() => onRetract(packet.id)}
            className="hover-btn-outline"
            style={{
              flex: "none",
              background: "transparent",
              border: "1px solid rgba(255,255,255,.14)",
              color: "#8A8A92",
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Retract
          </button>
        )}
      </div>

      <p style={{ fontSize: 12.5, color: "#C7C7CC", lineHeight: 1.5, margin: "0 0 10px" }}>{packet.body}</p>

      {isStale && (
        <div style={{ fontSize: 11, color: "#6C6C74", marginBottom: 8 }}>
          Superseded by <span style={{ color: "#8A8A92" }}>{supersededBy!.title}</span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
          {packet.relatedPaths.map((p) => (
            <span
              key={p}
              style={{
                fontFamily: "ui-monospace,monospace",
                fontSize: 10.5,
                color: "#8A8A92",
                border: "1px solid rgba(255,255,255,.1)",
                borderRadius: 4,
                padding: "1px 6px",
              }}
            >
              {p}
            </span>
          ))}
        </div>
        <span style={{ fontSize: 11, color: "#6C6C74", flex: "none" }}>{author.name}</span>
      </div>
    </div>
  );
}
