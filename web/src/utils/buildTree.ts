import type { TreeNode } from "@orbit/types";

export interface UiTreeNode {
  path: string;
  type: "file" | "dir";
  children: UiTreeNode[];
}

function parentPathOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

/** Nests a flat TreeNode[] (as GET /api/repos/:id/tree returns) into a tree for rendering. */
export function buildUiTree(nodes: TreeNode[]): UiTreeNode[] {
  const root: UiTreeNode[] = [];
  const dirs = new Map<string, UiTreeNode>();

  function ensureDir(path: string): UiTreeNode[] {
    if (path === "") return root;
    const existing = dirs.get(path);
    if (existing) return existing.children;
    const node: UiTreeNode = { path, type: "dir", children: [] };
    dirs.set(path, node);
    ensureDir(parentPathOf(path)).push(node);
    return node.children;
  }

  for (const n of [...nodes].sort((a, b) => a.path.localeCompare(b.path))) {
    if (n.type === "dir") {
      ensureDir(n.path);
    } else {
      ensureDir(parentPathOf(n.path)).push({ path: n.path, type: "file", children: [] });
    }
  }
  return root;
}
