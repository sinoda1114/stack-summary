const SCHEME_URL = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;
const HTTP_URL = /^https?:\/\/\S+$/i;

export type MemoBodyIdentity =
  | { kind: "url_set"; urls: readonly string[]; urlSetHash: string }
  | { kind: "body" };

export function normalizeRawText(text: string): string {
  const withLineFeeds = text
    .normalize("NFKC")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n");
  const trimmedLines = withLineFeeds
    .split("\n")
    .map((line) => line.replace(/[\p{White_Space}]+$/u, ""))
    .join("\n");
  return trimmedLines.replaceAll(/\n{3,}/g, "\n\n").trim();
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  let hex = "";
  for (const byte of new Uint8Array(digest)) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

export async function rawHash(text: string): Promise<string> {
  return sha256Hex(normalizeRawText(text));
}

export function aliasKey(name: string): string | null {
  const key = name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{White_Space}\u005F\u002D\u2010\u2011]/gu, "");
  return key.length === 0 ? null : key;
}

export function httpUrlSet(body: string): string[] {
  const urls = new Set<string>();
  for (const token of whitespaceTokens(body)) {
    if (!HTTP_URL.test(token)) {
      continue;
    }
    const url = withoutFragment(token);
    if (HTTP_URL.test(url)) {
      urls.add(url);
    }
  }
  return [...urls].sort();
}

export async function classifyMemoBody(
  body: string,
): Promise<MemoBodyIdentity> {
  const parts = whitespaceTokens(body);
  if (parts.length === 0 || !parts.every((token) => SCHEME_URL.test(token))) {
    return { kind: "body" };
  }
  const urls = httpUrlSet(body);
  if (urls.length === 0) {
    return { kind: "body" };
  }
  return {
    kind: "url_set",
    urls,
    urlSetHash: await sha256Hex(urls.join("\n")),
  };
}

function whitespaceTokens(body: string): string[] {
  return body.split(/[\p{White_Space}]+/u).filter((token) => token.length > 0);
}

function withoutFragment(url: string): string {
  const hashAt = url.indexOf("#");
  if (hashAt === -1) {
    return url;
  }
  return url.slice(0, hashAt);
}
