import { useEffect, useState } from "react";
import type { ContextPacket } from "@orbit/types";
import { getAllContext, retractContext } from "../../api/mockApi";
import { CONTEXT_PACKET_TYPES, CONTEXT_PACKET_TYPE_LABEL } from "../../data/contextPackets";
import ContextPacketCard from "../ContextPacketCard";

export default function ContextBoardScreen() {
  const [packets, setPackets] = useState<ContextPacket[]>([]);
  const [pathFilter, setPathFilter] = useState("");

  useEffect(() => {
    getAllContext().then(setPackets);
  }, []);

  const handleRetract = async (id: string) => {
    setPackets((prev) => prev.filter((p) => p.id !== id));
    await retractContext(id);
  };

  const needle = pathFilter.trim().toLowerCase();
  const filtered = needle ? packets.filter((p) => p.relatedPaths.some((path) => path.toLowerCase().includes(needle))) : packets;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "36px 44px 44px" }}>
      <h1 style={{ fontSize: 21, fontWeight: 600, margin: "0 0 4px" }}>Context Board</h1>
      <p style={{ fontSize: 13, color: "#8A8A92", margin: "0 0 20px" }}>
        The team's shared knowledge — constraints, discoveries, and open threads agents have published for each other.
      </p>

      <input
        value={pathFilter}
        onChange={(e) => setPathFilter(e.target.value)}
        placeholder="Filter by path…"
        style={{
          width: 280,
          background: "#131316",
          border: "1px solid rgba(255,255,255,.1)",
          borderRadius: 6,
          padding: "8px 10px",
          color: "#EDEDEF",
          fontSize: 13,
          marginBottom: 28,
        }}
      />

      {CONTEXT_PACKET_TYPES.map((type) => {
        const typePackets = filtered.filter((p) => p.type === type);
        if (typePackets.length === 0) return null;

        const topLevel = typePackets.filter((p) => !typePackets.some((q) => q.supersedes === p.id));

        return (
          <div key={type} style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#8A8A92", letterSpacing: ".03em", marginBottom: 10 }}>
              {CONTEXT_PACKET_TYPE_LABEL[type].toUpperCase()} · {typePackets.length}
            </div>
            {topLevel.map((p) => {
              const chain: Array<{ packet: ContextPacket; supersededBy: ContextPacket }> = [];
              let cur = p;
              while (cur.supersedes) {
                const prev = typePackets.find((q) => q.id === cur.supersedes);
                if (!prev) break;
                chain.push({ packet: prev, supersededBy: cur });
                cur = prev;
              }
              return (
                <div key={p.id}>
                  <ContextPacketCard packet={p} onRetract={handleRetract} />
                  {chain.map(({ packet, supersededBy }) => (
                    <ContextPacketCard key={packet.id} packet={packet} supersededBy={supersededBy} onRetract={handleRetract} />
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}

      {filtered.length === 0 && <div style={{ fontSize: 13, color: "#6C6C74" }}>No context packets match "{pathFilter}".</div>}
    </div>
  );
}
