import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  exportMarkdown,
  loadExportBundle,
  parseExportMarkdown,
  type ExportBundle,
} from "../../src/worker/db/export-data";
import { loadMemoDetail, searchMemos } from "../../src/worker/db/memo-search";
import { promoteMention } from "../../src/worker/db/promote-mention";

const NOW = "2026-10-10T00:00:00.000Z";

describe("メモ検索と格上げと書き出し", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM memo_techs"),
      env.DB.prepare("DELETE FROM memo_mentions"),
      env.DB.prepare("DELETE FROM memo_tags"),
      env.DB.prepare("DELETE FROM memo_urls"),
      env.DB.prepare("DELETE FROM memo_similars"),
      env.DB.prepare("DELETE FROM tech_tags"),
      env.DB.prepare("DELETE FROM tech_aliases"),
      env.DB.prepare("DELETE FROM memos"),
      env.DB.prepare("DELETE FROM techs"),
      env.DB.prepare("DELETE FROM tags"),
      env.DB.prepare("DELETE FROM imports"),
    ]);
  });

  it("検索は % と _ を文字として扱い、タグ名は完全一致で、日付の無いメモを後ろに置く", async () => {
    const percent = await insertMemo({ title: "100%", body: "割合", memoDate: "2026-01-01" });
    const underscore = await insertMemo({ title: "a_b", body: "下線", memoDate: "2026-02-01" });
    const plain = await insertMemo({ title: "axb", body: "普通", memoDate: null });
    await tagMemo(percent, "Edge");
    await tagMemo(underscore, "EdgeCase");

    const percentHits = await searchMemos(env.DB, { q: "%", tag: "" });
    expect(percentHits.memos.map((memo) => memo.id)).toEqual([percent]);

    const underscoreHits = await searchMemos(env.DB, { q: "_", tag: "" });
    expect(underscoreHits.memos.map((memo) => memo.id)).toEqual([underscore]);

    const literal = await searchMemos(env.DB, { q: "a_b", tag: "" });
    expect(literal.memos.map((memo) => memo.id)).toEqual([underscore]);

    const tagged = await searchMemos(env.DB, { q: "", tag: "Edge" });
    expect(tagged.memos.map((memo) => memo.id)).toEqual([percent]);

    const ordered = await searchMemos(env.DB, { q: "", tag: "" });
    expect(ordered.memos.map((memo) => memo.id)).toEqual([underscore, percent, plain]);
    expect(plain).not.toBe(percent);
  });

  it("検索語が LIKE の 50 バイトを超えても、大文字小文字を無視して見つかる", async () => {
    const japanese = "あ".repeat(20);
    const english = "Ab".repeat(30);
    const japaneseId = await insertMemo({
      title: "短い題",
      body: `前文${japanese}後文`,
      memoDate: "2026-05-01",
    });
    const englishId = await insertMemo({
      title: english,
      body: "本文",
      memoDate: "2026-05-02",
    });

    const japaneseHits = await searchMemos(env.DB, { q: japanese, tag: "" });
    expect(japaneseHits.memos.map((memo) => memo.id)).toEqual([japaneseId]);

    const englishHits = await searchMemos(env.DB, { q: english.toLowerCase(), tag: "" });
    expect(englishHits.memos.map((memo) => memo.id)).toEqual([englishId]);
  });

  it("検索は 50 件を超えて続きを返す", async () => {
    const statements = [];
    for (let index = 0; index < 51; index += 1) {
      const importId = `import-${index}`;
      const memoId = `memo-${index}`;
      const createdAt = `2026-10-10T00:${String(index).padStart(2, "0")}:00.000Z`;
      statements.push(
        env.DB.prepare(
          `INSERT INTO imports (id, raw_text, raw_hash, status, created_at, updated_at)
           VALUES (?, '原文', ?, 'done', ?, ?)`,
        ).bind(importId, `hash-${index}`, createdAt, createdAt),
        env.DB.prepare(
          `INSERT INTO memos (id, import_id, title, body, created_at)
           VALUES (?, ?, ?, '本文', ?)`,
        ).bind(memoId, importId, `題 ${index}`, createdAt),
      );
    }
    await env.DB.batch(statements);
    const listed = await searchMemos(env.DB, { q: "", tag: "" });
    expect(listed.memos).toHaveLength(50);
    expect(listed.memos[0]?.id).toBe("memo-50");
    expect(listed.memos.some((memo) => memo.id === "memo-0")).toBe(false);
    expect(listed.nextCursor).not.toBeNull();
    const rest = await searchMemos(env.DB, { q: "", tag: "", cursor: listed.nextCursor });
    expect(rest.memos.map((memo) => memo.id)).toEqual(["memo-0"]);
    expect(rest.nextCursor).toBeNull();
  });

  it("詳細は関連技術と言及と似たメモを返す", async () => {
    const memoId = await insertMemo({ title: "本題", body: "本文 https://example.com", memoDate: "2026-03-01" });
    const similarId = await insertMemo({ title: "似た題", body: "別本文", memoDate: null });
    const techId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO techs (
           id, name, name_key, status, status_by, created_at, updated_at
         ) VALUES (?, 'Hono', 'hono', 'unrated', 'model', ?, ?)`,
      ).bind(techId, NOW, NOW),
      env.DB.prepare(
        "INSERT INTO memo_techs (memo_id, tech_id, relation) VALUES (?, ?, 'comparison')",
      ).bind(memoId, techId),
      env.DB.prepare("INSERT INTO memo_mentions (memo_id, name) VALUES (?, 'Laya')").bind(memoId),
      env.DB.prepare(
        "INSERT INTO memo_similars (memo_id, similar_memo_id) VALUES (?, ?)",
      ).bind(memoId, similarId),
    ]);

    expect(await loadMemoDetail(env.DB, memoId)).toEqual({
      id: memoId,
      title: "本題",
      body: "本文 https://example.com",
      memoDate: "2026-03-01",
      techs: [{ id: techId, name: "Hono", relation: "comparison" }],
      mentions: [{ name: "Laya" }],
      similars: [{ id: similarId, title: "似た題" }],
    });
    expect(await loadMemoDetail(env.DB, "missing")).toBeNull();
  });

  it("格上げは言及を主題の技術にし、既存の関係は残す", async () => {
    const memoId = await insertMemo({ title: "題", body: "本文", memoDate: null });
    await env.DB.prepare("INSERT INTO memo_mentions (memo_id, name) VALUES (?, 'Laya')")
      .bind(memoId)
      .run();

    const created = await promoteMention(env.DB, { memoId, name: "Laya", now: NOW });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(created.relation).toBe("subject");
    const mention = await env.DB.prepare(
      "SELECT name FROM memo_mentions WHERE memo_id = ? AND name = 'Laya'",
    )
      .bind(memoId)
      .first();
    expect(mention).toBeNull();
    const link = await env.DB.prepare(
      "SELECT relation FROM memo_techs WHERE memo_id = ? AND tech_id = ?",
    )
      .bind(memoId, created.techId)
      .first<{ relation: string }>();
    expect(link).toEqual({ relation: "subject" });
    const alias = await env.DB.prepare(
      "SELECT source FROM tech_aliases WHERE alias_key = 'laya'",
    ).first<{ source: string }>();
    expect(alias).toEqual({ source: "model" });

    await env.DB.prepare(
      "UPDATE memo_techs SET relation = 'comparison' WHERE memo_id = ? AND tech_id = ?",
    )
      .bind(memoId, created.techId)
      .run();
    await env.DB.prepare("INSERT INTO memo_mentions (memo_id, name) VALUES (?, 'laya')")
      .bind(memoId)
      .run();
    const again = await promoteMention(env.DB, { memoId, name: "laya", now: NOW });
    expect(again).toEqual({ ok: true, techId: created.techId, relation: "comparison" });
    const kept = await env.DB.prepare(
      "SELECT relation FROM memo_techs WHERE memo_id = ? AND tech_id = ?",
    )
      .bind(memoId, created.techId)
      .first<{ relation: string }>();
    expect(kept).toEqual({ relation: "comparison" });
  });

  it("別名の格上げは、その別名が指す技術に結び、言及を消す", async () => {
    const memoId = await insertMemo({ title: "題", body: "本文", memoDate: null });
    const techId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO techs (
           id, name, name_key, status, status_by, created_at, updated_at
         ) VALUES (?, 'Cloudflare Workers', 'cloudflareworkers', 'unrated', 'model', ?, ?)`,
      ).bind(techId, NOW, NOW),
      env.DB.prepare(
        `INSERT INTO tech_aliases (alias_key, alias, tech_id, source)
         VALUES ('cloudflareworkers', 'Cloudflare Workers', ?, 'model')`,
      ).bind(techId),
      env.DB.prepare(
        `INSERT INTO tech_aliases (alias_key, alias, tech_id, source)
         VALUES ('workers', 'Workers', ?, 'model')`,
      ).bind(techId),
      env.DB.prepare("INSERT INTO memo_mentions (memo_id, name) VALUES (?, 'Workers')").bind(
        memoId,
      ),
    ]);

    const promoted = await promoteMention(env.DB, { memoId, name: "Workers", now: NOW });
    expect(promoted).toEqual({ ok: true, techId, relation: "subject" });
    const mention = await env.DB.prepare(
      "SELECT name FROM memo_mentions WHERE memo_id = ?",
    )
      .bind(memoId)
      .first();
    expect(mention).toBeNull();
  });

  it("無い言及は 404 相当、空の名前は消さず拒否する", async () => {
    const memoId = await insertMemo({ title: "題", body: "本文", memoDate: null });
    expect(await promoteMention(env.DB, { memoId, name: "Laya", now: NOW })).toEqual({
      ok: false,
      code: "not_found",
    });

    await env.DB.prepare("INSERT INTO memo_mentions (memo_id, name) VALUES (?, ' - ')")
      .bind(memoId)
      .run();
    expect(await promoteMention(env.DB, { memoId, name: " - ", now: NOW })).toEqual({
      ok: false,
      code: "invalid",
    });
    const kept = await env.DB.prepare(
      "SELECT name FROM memo_mentions WHERE memo_id = ?",
    )
      .bind(memoId)
      .first<{ name: string }>();
    expect(kept).toEqual({ name: " - " });
  });

  it("書き出しは表を data のキーにし、Markdown も同じ表を書く", async () => {
    const memoId = await insertMemo({
      title: "題",
      body: "原文の本文",
      memoDate: "2026-04-01",
    });
    const bundle = await loadExportBundle(env.DB);
    expect(Object.keys(bundle).sort()).toEqual([
      "categories",
      "imports",
      "memo_mentions",
      "memo_similars",
      "memo_tags",
      "memo_techs",
      "memo_urls",
      "memos",
      "subcategories",
      "tags",
      "tech_aliases",
      "tech_tags",
      "techs",
    ]);
    const memo = bundle.memos.find((row) => row.id === memoId);
    expect(memo?.body).toBe("原文の本文");
    expect(memo?.title).toBe("題");
    expect(bundle.categories.some((row) => row.id === "language")).toBe(true);

    const markdown = exportMarkdown(bundle);
    expect(markdown).toContain("## memos");
    expect(markdown).toContain("## tech_aliases");
    expect(markdown).toContain("body=原文の本文");
    expect(markdown).toContain("## subcategories");
    expect(markdown).toContain("（行なし）");

    const roundTrip = emptyBundle();
    roundTrip.memos = [
      {
        id: "memo-line",
        title: "",
        body: "1行目\n2行目",
        memo_date: null,
        note: "a | b\\c",
        count: 2,
        ready: false,
      },
    ];
    const restored = parseExportMarkdown(exportMarkdown(roundTrip));
    expect(restored.memos).toEqual(roundTrip.memos);
    expect(restored.techs).toEqual([]);
  });
});

function emptyBundle(): ExportBundle {
  return parseExportMarkdown("# 書き出し\n");
}

async function insertMemo(input: {
  title: string;
  body: string;
  memoDate: string | null;
}): Promise<string> {
  const importId = crypto.randomUUID();
  const memoId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO imports (id, raw_text, raw_hash, status, created_at, updated_at)
       VALUES (?, ?, ?, 'done', ?, ?)`,
    ).bind(importId, input.body, crypto.randomUUID(), NOW, NOW),
    env.DB.prepare(
      `INSERT INTO memos (id, import_id, title, body, memo_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(memoId, importId, input.title, input.body, input.memoDate, NOW),
  ]);
  return memoId;
}

async function tagMemo(memoId: string, name: string): Promise<void> {
  const tagId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO tags (id, name, kind) VALUES (?, ?, 'topic')").bind(tagId, name),
    env.DB.prepare(
      "INSERT INTO memo_tags (memo_id, tag_id, source) VALUES (?, ?, 'user')",
    ).bind(memoId, tagId),
  ]);
}
