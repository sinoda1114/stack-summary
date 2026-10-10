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

function readAccessConfig(env: Env): AccessConfig | null {
  const teamDomain = env.ACCESS_TEAM_DOMAIN.trim().replace(/\/+$/, "");
  const audience = env.ACCESS_AUD.trim();
  const ownerEmail = env.OWNER_EMAIL.trim();
  if (
    teamDomain.length === 0 ||
    audience.length === 0 ||
    ownerEmail.length === 0
  ) {
    return null;
  }
  return { teamDomain, audience, ownerEmail };
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
  const config = readAccessConfig(c.env);
  const token = c.req.header(ACCESS_HEADER)?.trim();
  if (config === null || token === undefined || token.length === 0) {
    return c.json(fail("forbidden", FORBIDDEN_MESSAGE), 403);
  }
  try {
    await verifyAccessJwt(token, config, jwksFor(config.teamDomain));
  } catch (error) {
    console.error(
      "access jwt rejected",
      error instanceof Error ? error.name : "unknown",
    );
    return c.json(fail("forbidden", FORBIDDEN_MESSAGE), 403);
  }
  await next();
  return;
});

function emailsMatch(claim: unknown, ownerEmail: string): boolean {
  return (
    typeof claim === "string" &&
    claim.toLowerCase() === ownerEmail.toLowerCase()
  );
}
