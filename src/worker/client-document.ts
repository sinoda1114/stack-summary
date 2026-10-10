const CLIENT_DOCUMENT = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>stack-summary</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/client/main.tsx"></script>
  </body>
</html>
`;

const EXACT_CLIENT_PATHS = new Set([
  "/imports",
  "/inbox",
  "/taxonomy",
  "/export",
  "/memos",
  "/relations",
]);

const CLIENT_PREFIXES = ["/techs/", "/subcategories/", "/memos/"];

export function isClientDocumentPath(pathname: string): boolean {
  const path = withoutTrailingSlash(pathname);
  if (EXACT_CLIENT_PATHS.has(path)) {
    return true;
  }
  return CLIENT_PREFIXES.some((prefix) => hasSingleSegment(path, prefix));
}

function hasSingleSegment(path: string, prefix: string): boolean {
  if (!path.startsWith(prefix)) {
    return false;
  }
  const rest = path.slice(prefix.length);
  return rest.length > 0 && !rest.includes("/");
}

function withoutTrailingSlash(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export async function clientDocumentResponse(
  request: Request,
  env: Env,
): Promise<Response> {
  const fromAssets = await documentFromAssets(request, env);
  if (fromAssets !== null) {
    return fromAssets;
  }
  return new Response(CLIENT_DOCUMENT, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "no-store",
    },
  });
}

async function documentFromAssets(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  url.pathname = "/index.html";
  url.search = "";
  try {
    const response = await env.ASSETS.fetch(new Request(url, { method: "GET" }));
    if (!response.ok) {
      return null;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      return null;
    }
    return response;
  } catch {
    return null;
  }
}
