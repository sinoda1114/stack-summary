import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { mergeTech } from "../../src/worker/db/merge-tech";
import { upsertTag } from "../../src/worker/db/tags";
import {
  insertTechRelation,
  loadRelationGraph,
} from "../../src/worker/db/tech-relations";
import { relationJudge } from "../../src/worker/ai/relation-judge";

const NOW = "2026-10-10T00:00:00.000Z";

describe("技術の関係とタグの名寄せ", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM tech_relations"),
      env.DB.prepare("DELETE FROM tech_aliases"),
      env.DB.prepare("DELETE FROM techs"),
      env.DB.prepare("DELETE FROM tags"),
    ]);
  });

  it("自己参照と、同じ組の逆向きは書かない", async () => {
    const hono = await insertTech("Hono");
    const workers = await insertTech("Cloudflare Workers");
    expect(
      await insertTechRelation(env.DB, {
        fromTechId: hono,
        toTechId: hono,
        kind: "runs_on",
      }),
    ).toBe(false);
    expect(
      await insertTechRelation(env.DB, {
        fromTechId: hono,
        toTechId: workers,
        kind: "runs_on",
      }),
    ).toBe(true);
    expect(
      await insertTechRelation(env.DB, {
        fromTechId: workers,
        toTechId: hono,
        kind: "related",
      }),
    ).toBe(false);
    const graph = await loadRelationGraph(env.DB);
    expect(graph.edges).toEqual([
      { fromId: hono, toId: workers, kind: "runs_on" },
    ]);
    expect(graph.nodes.map((node) => node.name)).toEqual([
      "Cloudflare Workers",
      "Hono",
    ]);
    expect(relationJudge).toBeNull();
  });

  it("空白と大文字のタグは既存のタグに寄る", async () => {
    const first = await upsertTag(env.DB, { name: " Edge ", kind: "topic" });
    const second = await upsertTag(env.DB, { name: "edge", kind: "topic" });
    const vendor = await upsertTag(env.DB, { name: "Edge", kind: "vendor" });
    expect(second).toBe(first);
    expect(vendor).not.toBe(first);
    const names = await env.DB.prepare(
      "SELECT name, kind FROM tags ORDER BY kind, name",
    ).all<{ name: string; kind: string }>();
    expect(names.results).toEqual([
      { name: "Edge", kind: "topic" },
      { name: "Edge", kind: "vendor" },
    ]);
    await env.DB.prepare(
      "INSERT INTO tags (id, name, kind) VALUES ('tag-cf', 'Cloudflare', 'vendor')",
    ).run();
    expect(await upsertTag(env.DB, { name: "cloudflare", kind: "vendor" })).toBe("tag-cf");
    await env.DB.prepare(
      "INSERT INTO tags (id, name, kind, name_key) VALUES ('tag-spaced', 'Foo  Bar', 'topic', 'foo  bar'), ('tag-folded', 'foo bar', 'topic', 'foo bar')",
    ).run();
    expect(await upsertTag(env.DB, { name: "Foo  Bar", kind: "topic" })).toBe("tag-folded");
  });

  it("技術の統合は関係を残す側へ移し、自分自身と既存の組は捨てる", async () => {
    const hono = await insertTech("Hono");
    const next = await insertTech("Hono 本体");
    const workers = await insertTech("Cloudflare Workers");
    expect(
      await insertTechRelation(env.DB, {
        fromTechId: hono,
        toTechId: workers,
        kind: "runs_on",
      }),
    ).toBe(true);
    expect(
      await insertTechRelation(env.DB, {
        fromTechId: hono,
        toTechId: next,
        kind: "related",
      }),
    ).toBe(true);
    expect(
      await insertTechRelation(env.DB, {
        fromTechId: next,
        toTechId: workers,
        kind: "depends_on",
      }),
    ).toBe(true);
    expect(await mergeTech(env.DB, { sourceId: hono, intoId: next, now: NOW })).toEqual({
      ok: true,
    });
    const graph = await loadRelationGraph(env.DB);
    expect(graph.edges).toEqual([
      { fromId: next, toId: workers, kind: "depends_on" },
    ]);
  });
});

async function insertTech(name: string): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO techs (id, name, name_key, status, status_by, created_at, updated_at)
     VALUES (?, ?, ?, 'unrated', 'model', ?, ?)`,
  )
    .bind(id, name, name.toLowerCase(), NOW, NOW)
    .run();
  return id;
}
