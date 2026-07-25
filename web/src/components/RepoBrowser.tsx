import { useEffect, useState } from "react";
import type { ContextPacket, TreeNode } from "@orbit/types";
import { getRepoTree, getRepoFile, getRepoContext } from "../api";
import { buildUiTree, type UiTreeNode } from "../utils/buildTree";
import { langForPath, firstFilePath } from "../data/fileTree";
import { packetsForPath } from "../data/contextPackets";
import CodeViewer from "./CodeViewer";
import ContextPacketCard from "./ContextPacketCard";

function badgeLabel(packets: ContextPacket[]): string {
  const byType = new Map<string, number>();
  for (const p of packets) byType.set(p.type, (byType.get(p.type) ?? 0) + 1);
  return [...byType.entries()].map(([type, n]) => `${n} ${type.replace("_", " ")}${n > 1 ? "s" : ""}`).join(", ");
}

function TreeItem({
  node,
  depth,
  selectedPath,
  onSelect,
  packets,
  repoId,
}: {
  node: UiTreeNode;
  depth: number;
  selectedPath: string;
  onSelect: (path: string) => void;
  packets: ContextPacket[];
  repoId: string;
}) {
  if (node.type === "dir") {
    return (
      <>
        <div style={{ padding: `5px 8px 5px ${8 + depth * 16}px`, fontSize: 12.5, color: "#8A8A92" }}>{node.path.split("/").pop()}</div>
        {node.children.map((child) => (
          <TreeItem key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} packets={packets} repoId={repoId} />
        ))}
      </>
    );
  }

  const filePackets = packetsForPath(packets, repoId, node.path);
  const isSelected = node.path === selectedPath;

  return (
    <div
      onClick={() => onSelect(node.path)}
      className={isSelected ? "" : "hover-surface"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: `4px 8px 4px ${8 + depth * 16}px`,
        borderRadius: 5,
        cursor: "pointer",
        background: isSelected ? "rgba(255,255,255,.06)" : "transparent",
      }}
    >
      <span
        style={{
          fontSize: 12.5,
          color: isSelected ? "#EDEDEF" : "#9A9AA2",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          flex: 1,
          minWidth: 0,
        }}
      >
        {node.path.split("/").pop()}
      </span>
      {filePackets.length > 0 && (
        <span
          title={badgeLabel(filePackets)}
          style={{
            flex: "none",
            fontSize: 10,
            color: "#8A8A92",
            border: "1px solid rgba(255,255,255,.14)",
            borderRadius: 4,
            padding: "0 5px",
          }}
        >
          {filePackets.length}
        </span>
      )}
    </div>
  );
}

export default function RepoBrowser({ repoId }: { repoId: string }) {
  const [tree, setTree] = useState<UiTreeNode[]>([]);
  const [packets, setPackets] = useState<ContextPacket[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>(firstFilePath(repoId) ?? "");
  const [content, setContent] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const initialPath = firstFilePath(repoId) ?? "";
    setSelectedPath(initialPath);
    getRepoTree(repoId).then((nodes: TreeNode[]) => {
      if (!cancelled) setTree(buildUiTree(nodes));
    });
    getRepoContext(repoId).then((p) => {
      if (!cancelled) setPackets(p);
    });
    return () => {
      cancelled = true;
    };
  }, [repoId]);

  useEffect(() => {
    if (!selectedPath) return;
    let cancelled = false;
    getRepoFile(repoId, selectedPath).then((c) => {
      if (!cancelled) setContent(c);
    });
    return () => {
      cancelled = true;
    };
  }, [repoId, selectedPath]);

  const openFilePackets = selectedPath ? packetsForPath(packets, repoId, selectedPath) : [];

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <div style={{ width: 260, flex: "none", borderRight: "1px solid rgba(255,255,255,.08)", overflowY: "auto", padding: 10 }}>
        {tree.map((node) => (
          <TreeItem key={node.path} node={node} depth={0} selectedPath={selectedPath} onSelect={setSelectedPath} packets={packets} repoId={repoId} />
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "18px 20px" }}>
        {selectedPath && (
          <>
            <div
              style={{
                fontFamily: "ui-monospace,monospace",
                fontSize: 12,
                color: "#C7C7CC",
                background: "#18181C",
                border: "1px solid rgba(255,255,255,.07)",
                borderRadius: "8px 8px 0 0",
                padding: "8px 12px",
              }}
            >
              {selectedPath}
            </div>
            <div style={{ border: "1px solid rgba(255,255,255,.07)", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "12px 14px", marginBottom: openFilePackets.length ? 16 : 0 }}>
              <CodeViewer content={content} lang={langForPath(selectedPath)} />
            </div>
            {openFilePackets.length > 0 && (
              <div>
                <div style={{ fontSize: 11, letterSpacing: ".04em", color: "#8A8A92", fontWeight: 600, marginBottom: 10 }}>
                  CONTEXT ON THIS FILE
                </div>
                {openFilePackets.map((p) => (
                  <ContextPacketCard key={p.id} packet={p} compact />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
