export type DiffFile = {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  numbered: string; // diff text with new-file line numbers, sent to the model
  validLines: Set<number>; // new-file line numbers that can receive a comment
  truncated: boolean;
  skipped?: string; // set when the file is excluded from review
};

const SKIP_PATTERNS: RegExp[] = [
  /(^|\/)(package-lock\.json|yarn\.lock|bun\.lockb?|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|go\.sum)$/,
  /\.min\.(js|css)$/,
  /\.map$/,
  /(^|\/)(node_modules|dist|build|\.next)\//,
  /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|zip|svg)$/i,
];

export function parseDiff(raw: string, maxFileChars = 20000): DiffFile[] {
  // The first element is whatever precedes the first "diff --git", so drop it.
  const chunks = raw.split(/^diff --git /m).slice(1);
  return chunks.map((chunk) => parseChunk(chunk, maxFileChars));
}

function parseChunk(chunk: string, maxFileChars: number): DiffFile {
  const lines = chunk.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();

  const firstHunk = lines.findIndex((l) => l.startsWith("@@"));
  const header = firstHunk === -1 ? lines : lines.slice(0, firstHunk);

  // Work out the path and status from the header.
  let status: DiffFile["status"] = "modified";
  if (header.some((l) => l.startsWith("new file mode"))) status = "added";
  else if (header.some((l) => l.startsWith("deleted file mode")))
    status = "deleted";
  else if (header.some((l) => l.startsWith("rename from"))) status = "renamed";

  const plus = header.find((l) => l.startsWith("+++ "));
  const minus = header.find((l) => l.startsWith("--- "));
  let path = "";
    if (plus && plus !== "+++ /dev/null") path = headerPath(plus, "b/");
  else if (minus) path = headerPath(minus, "a/");
  else {
    const m = lines[0]?.match(/^a\/(.+) b\/(.+)$/);
    path = m ? m[2] : (lines[0] ?? "unknown");
  }

  const base = {
    path,
    status,
    numbered: "",
    validLines: new Set<number>(),
    truncated: false,
  };

  const isBinary =
    chunk.includes("\nBinary files ") || chunk.includes("\nGIT binary patch");
  if (isBinary) return { ...base, skipped: "binary file" };
  if (status === "deleted") return { ...base, skipped: "deleted file" };
  if (SKIP_PATTERNS.some((re) => re.test(path))) {
    return { ...base, skipped: "lockfile, generated, or asset file" };
  }
  if (firstHunk === -1) return { ...base, skipped: "no content changes" };

  // Walk the hunks, tracking the line number on the new side of the diff.
  const out: string[] = [];
  const validLines = new Set<number>();
  let size = 0;
  let truncated = false;
  let newLine = 0;

  for (const line of lines.slice(firstHunk)) {
    let text: string;
    if (line.startsWith("@@")) {
      const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) newLine = parseInt(m[1], 10);
      text = line;
    } else if (line.startsWith("+")) {
      validLines.add(newLine);
      text = `L${newLine} + ${line.slice(1)}`;
      newLine++;
    } else if (line.startsWith("-")) {
      text = `     - ${line.slice(1)}`;
    } else if (line.startsWith("\\")) {
      continue; // "\ No newline at end of file"
    } else {
      // Context line (a leading space, or an empty line with trailing space stripped).
      validLines.add(newLine);
      text = `L${newLine}   ${line.slice(1)}`;
      newLine++;
    }

    if (size + text.length > maxFileChars) {
      truncated = true;
      break;
    }
    out.push(text);
    size += text.length + 1;
  }

  return { path, status, numbered: out.join("\n"), validLines, truncated };
}

const GIT_ESCAPES: Record<string, number> = {
  a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, '"': 34, "\\": 92,
};

// Decodes a C-style quoted path as git emits it, e.g. "b/caf\303\251.ts".
function unquoteGitPath(quoted: string): string {
  const chars = Array.from(quoted); // by code point, so emoji stay whole
  const encoder = new TextEncoder();
  const bytes: number[] = [];
  let i = 1; // skip the opening quote
  while (i < chars.length) {
    const ch = chars[i];
    if (ch === '"') break; // closing quote
    if (ch === "\\" && i + 1 < chars.length) {
      const next = chars[i + 1];
      if (next >= "0" && next <= "7") {
        // up to 3 octal digits = one raw byte
        let oct = "";
        let j = i + 1;
        while (j < chars.length && oct.length < 3 && chars[j] >= "0" && chars[j] <= "7") {
          oct += chars[j];
          j++;
        }
        bytes.push(parseInt(oct, 8) & 0xff);
        i = j;
        continue;
      }
      if (next in GIT_ESCAPES) {
        bytes.push(GIT_ESCAPES[next]);
        i += 2;
        continue;
      }
    }
    bytes.push(...encoder.encode(ch));
    i++;
  }
  // Collect raw bytes first, then decode, so multi-byte characters reassemble.
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

// Extracts the file path from a "--- a/..." or "+++ b/..." header line.
function headerPath(line: string, prefix: "a/" | "b/"): string {
  let raw = line.slice(4); // drop "--- " or "+++ "
  if (raw.startsWith('"')) {
    raw = unquoteGitPath(raw);
  } else {
    // Git appends a tab after names containing spaces. Cut at the tab; don't trim,
    // because a filename can legitimately end in a space.
    const tab = raw.indexOf("\t");
    if (tab !== -1) raw = raw.slice(0, tab);
  }
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
}