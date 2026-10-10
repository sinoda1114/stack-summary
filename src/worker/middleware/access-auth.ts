import { createMiddleware } from "hono/factory";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";
import { fail, FORBIDDEN_MESSAGE } from "../http";

const ACCESS_HEADER = "cf-access-jwt-assertion";

export type AccessConfig = {
  teamDomain: string;
  audience: string;
  ownerEmail: string;
};

const jwksByUrl = new Map<string, JWTVerifyGetKey>();

type AuthBindings = {
  teamDomain: unknown;
  audience: unknown;
  ownerEmail: unknown;
  previewOpen: unknown;
};

type AuthDecision =
  | { kind: "allow" }
  | { kind: "deny" }
  | { kind: "verify"; config: AccessConfig };

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function authBindings(env: Env): AuthBindings {
  const source = env as Env & {
    OWNER_EMAIL?: unknown;
    PREVIEW_OPEN?: unknown;
  };
  return {
    teamDomain: source.ACCESS_TEAM_DOMAIN,
    audience: source.ACCESS_AUD,
    ownerEmail: source.OWNER_EMAIL,
    previewOpen: source.PREVIEW_OPEN,
  };
}

export function decideAuth(env: Env): AuthDecision {
  const bindings = authBindings(env);
  const ownerEmail = readString(bindings.ownerEmail);
  if (ownerEmail.length === 0) {
    return { kind: "allow" };
  }
  const teamDomain = readString(bindings.teamDomain).replace(/\/+$/, "");
  const audience = readString(bindings.audience);
  if (isAccessTeamDomain(teamDomain) && audience.length > 0) {
    return { kind: "verify", config: { teamDomain, audience, ownerEmail } };
  }
  if (bindings.previewOpen === "1") {
    return { kind: "allow" };
  }
  return { kind: "deny" };
}

function isAccessTeamDomain(teamDomain: string): boolean {
  let url: URL;
  try {
    url = new URL(teamDomain);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === "" &&
    /^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(url.hostname)
  );
}

function jwksFor(teamDomain: string): JWTVerifyGetKey {
  const url = `${teamDomain}/cdn-cgi/access/certs`;
  const cached = jwksByUrl.get(url);
  if (cached !== undefined) {
    return cached;
  }
  const created = createRemoteJWKSet(new URL(url));
  jwksByUrl.set(url, created);
  return created;
}

export async function verifyAccessJwt(
  token: string,
  config: AccessConfig,
  getKey: JWTVerifyGetKey,
): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, getKey, {
    issuer: config.teamDomain,
    audience: config.audience,
    algorithms: ["RS256"],
    requiredClaims: ["exp", "email"],
  });
  if (!emailsMatch(payload.email, config.ownerEmail)) {
    throw new Error("owner mismatch");
  }
  return payload;
}

export const accessAuth = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const decision = decideAuth(c.env);
  switch (decision.kind) {
    case "allow":
      await next();
      return;
    case "deny":
      return c.json(fail("forbidden", FORBIDDEN_MESSAGE), 403);
    case "verify": {
      const token = c.req.header(ACCESS_HEADER)?.trim();
      if (token === undefined || token.length === 0) {
        return c.json(fail("forbidden", FORBIDDEN_MESSAGE), 403);
      }
      try {
        await verifyAccessJwt(
          token,
          decision.config,
          jwksFor(decision.config.teamDomain),
        );
      } catch (error) {
        console.error(
          "access jwt rejected",
          error instanceof Error ? error.name : "unknown",
        );
        return c.json(fail("forbidden", FORBIDDEN_MESSAGE), 403);
      }
      await next();
      return;
    }
    default: {
      const unreachable: never = decision;
      return unreachable;
    }
  }
});

function emailsMatch(claim: unknown, ownerEmail: string): boolean {
  return (
    typeof claim === "string" &&
    claim.toLowerCase() === ownerEmail.toLowerCase()
  );
}
