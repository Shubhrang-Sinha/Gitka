function readHttpUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function appendPath(base: URL, segments: (string | number)[]) {
  if (segments.some((segment) => !String(segment) || segment === "." || segment === "..")) {
    return null;
  }
  const url = new URL(base);
  const path = segments.map((segment) => encodeURIComponent(segment)).join("/");
  url.pathname = [url.pathname.replace(/\/+$/, ""), path].filter(Boolean).join("/") || "/";
  url.search = "";
  url.hash = "";
  return url;
}

export function forgejoHomeUrl(...path: (string | number)[]) {
  const base = readHttpUrl(process.env.FORGEJO_PUBLIC_URL || process.env.FORGEJO_URL);
  return base ? appendPath(base, path)?.href ?? null : null;
}

export function forgejoRepoUrl(repo: string, ...path: (string | number)[]) {
  const parts = repo.split("/");
  return parts.length === 2 ? forgejoHomeUrl(...parts, ...path) : null;
}

/** Move URLs returned by an internal Forgejo origin to the configured public base. */
export function forgejoPublicUrl(value: string) {
  const canonical = readHttpUrl(value);
  if (!canonical) return null;
  const internal = readHttpUrl(process.env.FORGEJO_URL);
  const publicBase = readHttpUrl(process.env.FORGEJO_PUBLIC_URL);
  if (!publicBase || !internal || canonical.origin !== internal.origin) return canonical.href;

  const internalPath = internal.pathname.replace(/\/+$/, "");
  if (internalPath && canonical.pathname !== internalPath && !canonical.pathname.startsWith(internalPath + "/")) {
    return canonical.href;
  }
  const path = canonical.pathname.slice(internalPath.length);
  publicBase.pathname = publicBase.pathname.replace(/\/+$/, "") + (path || "/");
  publicBase.search = canonical.search;
  publicBase.hash = canonical.hash;
  return publicBase.href;
}

export function forgejoSourceFromRepoUrl(
  repoUrl: string | null,
  kind: "branch" | "commit",
  ref: string,
  filePath: string,
  startLine?: number,
  endLine?: number,
) {
  const base = readHttpUrl(repoUrl ?? undefined);
  const url = base && appendPath(base, ["src", kind, ref, ...filePath.split("/")]);
  if (!url) return null;
  if (startLine !== undefined && Number.isSafeInteger(startLine) && startLine > 0) {
    url.hash = endLine !== undefined && Number.isSafeInteger(endLine) && endLine > startLine
      ? `L${startLine}-L${endLine}`
      : `L${startLine}`;
  }
  return url.href;
}

export function forgejoSourceUrl(
  repo: string,
  kind: "branch" | "commit",
  ref: string,
  filePath: string,
  startLine?: number,
  endLine?: number,
) {
  return forgejoSourceFromRepoUrl(forgejoRepoUrl(repo), kind, ref, filePath, startLine, endLine);
}
