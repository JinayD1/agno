import type { CodeLang } from "../types";

const KEYWORDS: Record<CodeLang, string[]> = {
  python: ["def", "return", "if", "class", "import", "from", "self", "None", "True", "False"],
  typescript: ["export", "function", "const", "let", "return", "async", "await", "import", "from", "class", "new", "interface", "type"],
  hcl: ["resource", "provider", "terraform", "required_version", "variable"],
  markdown: [],
  text: [],
};

// Comment prefixes are language-specific — a global "#...$" pattern would
// wrongly swallow the rest of a line for CSS hex colors (#0B0B0D) or
// markdown anchors (#setup) as if they were comments.
const COMMENT_PATTERN: Record<CodeLang, string | null> = {
  python: "#.*$",
  typescript: "//.*$",
  hcl: "#.*$|//.*$",
  markdown: null,
  text: null,
};

const STRING_PATTERN = "\"[^\"]*\"|'[^']*'|`[^`]*`";

function tokenRegex(lang: CodeLang): RegExp {
  const comment = COMMENT_PATTERN[lang];
  const source = comment ? `(${comment}|${STRING_PATTERN})` : `(${STRING_PATTERN})`;
  return new RegExp(source, "g");
}

function keywordRegex(lang: CodeLang): RegExp | null {
  const words = KEYWORDS[lang];
  if (words.length === 0) return null;
  return new RegExp(`\\b(${words.join("|")})\\b`, "g");
}

interface Token {
  text: string;
  kind: "plain" | "comment" | "string" | "keyword";
}

function tokenizeLine(line: string, lang: CodeLang): Token[] {
  const tokens: Token[] = [];
  const parts = line.split(tokenRegex(lang));
  const kwRe = keywordRegex(lang);

  for (const part of parts) {
    if (part === "") continue;
    if (part.startsWith("#") || part.startsWith("//")) {
      tokens.push({ text: part, kind: "comment" });
      continue;
    }
    if (/^["'`]/.test(part)) {
      tokens.push({ text: part, kind: "string" });
      continue;
    }
    if (!kwRe) {
      tokens.push({ text: part, kind: "plain" });
      continue;
    }
    const subParts = part.split(kwRe);
    for (const sub of subParts) {
      if (sub === "") continue;
      tokens.push({ text: sub, kind: KEYWORDS[lang].includes(sub) ? "keyword" : "plain" });
    }
  }
  return tokens;
}

const TOKEN_COLOR: Record<Token["kind"], string> = {
  plain: "#C7C7CC",
  comment: "#54545A",
  string: "#9A9AA2",
  keyword: "#EDEDEF",
};

const TOKEN_WEIGHT: Record<Token["kind"], number> = {
  plain: 400,
  comment: 400,
  string: 400,
  keyword: 600,
};

export default function CodeViewer({ content, lang }: { content: string; lang: CodeLang }) {
  const lines = content.replace(/\n$/, "").split("\n");

  return (
    <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 12, lineHeight: 1.6 }}>
      {lines.map((line, i) => {
        const isHeading = lang === "markdown" && /^#+\s/.test(line);
        return (
          <div key={i} style={{ display: "flex" }}>
            <span style={{ width: 34, flex: "none", textAlign: "right", paddingRight: 12, color: "#4A4A50", userSelect: "none" }}>
              {i + 1}
            </span>
            <span style={{ whiteSpace: "pre", color: isHeading ? "#EDEDEF" : undefined, fontWeight: isHeading ? 600 : undefined }}>
              {isHeading
                ? line
                : tokenizeLine(line, lang).map((t, ti) => (
                    <span key={ti} style={{ color: TOKEN_COLOR[t.kind], fontWeight: TOKEN_WEIGHT[t.kind] }}>
                      {t.text}
                    </span>
                  ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
