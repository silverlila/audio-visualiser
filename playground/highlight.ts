export type Language = "tsx" | "ts" | "css" | "sh";

export type TokenKind = "keyword" | "string" | "comment" | "plain";

export interface Token {
  readonly kind: TokenKind;
  readonly text: string;
}

const SCRIPT = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|([A-Za-z_$][\w$]*)/g;

const PATTERNS: Record<Language, RegExp> = {
  tsx: SCRIPT,
  ts: SCRIPT,
  css: /(\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|([A-Za-z_$][\w$]*)/g,
  sh: /(#[^\n]*)|("(?:[^"\\\n]|\\.)*"|'[^'\n]*')|([A-Za-z_$][\w$]*)/g,
};

const SCRIPT_KEYWORDS: ReadonlySet<string> = new Set([
  "async",
  "await",
  "const",
  "default",
  "else",
  "export",
  "false",
  "from",
  "function",
  "if",
  "import",
  "let",
  "new",
  "null",
  "return",
  "true",
  "void",
]);

const KEYWORDS: Record<Language, ReadonlySet<string>> = {
  tsx: SCRIPT_KEYWORDS,
  ts: SCRIPT_KEYWORDS,
  css: new Set(),
  sh: new Set(["npm", "pnpm", "yarn", "bun"]),
};

function kindOf(match: RegExpExecArray, keywords: ReadonlySet<string>): TokenKind {
  if (match[1] !== undefined) return "comment";
  if (match[2] !== undefined) return "string";
  return keywords.has(match[0]) ? "keyword" : "plain";
}

export function highlight(code: string, language: Language): readonly Token[] {
  const keywords = KEYWORDS[language];
  const tokens: Token[] = [];
  let plainFrom = 0;
  for (const match of code.matchAll(PATTERNS[language])) {
    const kind = kindOf(match, keywords);
    if (kind === "plain") continue;
    if (match.index > plainFrom) tokens.push({ kind: "plain", text: code.slice(plainFrom, match.index) });
    tokens.push({ kind, text: match[0] });
    plainFrom = match.index + match[0].length;
  }
  if (plainFrom < code.length) tokens.push({ kind: "plain", text: code.slice(plainFrom) });
  return tokens;
}
