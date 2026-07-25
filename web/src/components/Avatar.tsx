import type { CSSProperties } from "react";
import type { Person } from "../types";

interface AvatarProps {
  person: Person;
  size: number;
  agentRadius?: number;
  fontSize?: number;
  style?: CSSProperties;
}

export default function Avatar({ person, size, agentRadius = 6, fontSize, style }: AvatarProps) {
  const fs = fontSize ?? Math.round(size * 0.32);
  if (person.isAgent) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: agentRadius,
          background: "#303038",
          border: "1px solid rgba(255,255,255,.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "none",
          ...style,
        }}
      >
        <span style={{ fontSize: fs, fontWeight: 700, color: "#EDEDEF" }}>{person.initials}</span>
      </div>
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "#2A2A30",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
        ...style,
      }}
    >
      <span style={{ fontSize: fs, fontWeight: 700, color: "#EDEDEF" }}>{person.initials}</span>
    </div>
  );
}
