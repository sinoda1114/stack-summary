import { extractRelationCandidates } from "../ai/relate-candidates";
import {
  judgeRelationKind,
  type RelationJudge,
} from "../ai/relation-judge";
import type { SavedMemo } from "../db/memos";
import {
  insertTechRelation,
  relationPairExists,
  relationPairKey,
} from "../db/tech-relations";
import { aliasKey } from "../ingest/normalize";
import type { ImportRunner } from "./import-steps";

export async function relateSavedMemos(
  runner: ImportRunner,
  fallback: RelationJudge,
  memos: readonly SavedMemo[],
): Promise<void> {
  for (const memo of memos) {
    const techs = await memoTechs(runner.db, memo.id);
    if (techs.length < 2) {
      continue;
    }
    const context = `${memo.title}\n${memo.body}`;
    const candidates = await extractRelationCandidates(runner.generator, {
      model: runner.modelLight,
      context,
      techs: techs.map((tech) => ({ name: tech.name })),
    });
    const allowed = new Map(techs.map((tech) => [tech.id, tech.name]));
    const seen = new Set<string>();
    for (const pair of candidates.pairs) {
      const fromId = await techIdByAlias(runner.db, pair.fromName);
      const toId = await techIdByAlias(runner.db, pair.toName);
      if (fromId === null || toId === null || fromId === toId) {
        continue;
      }
      const fromName = allowed.get(fromId);
      const toName = allowed.get(toId);
      if (fromName === undefined || toName === undefined) {
        continue;
      }
      const key = relationPairKey(fromId, toId);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      if (await relationPairExists(runner.db, fromId, toId)) {
        continue;
      }
      const kind = await judgeRelationKind(fallback, {
        from: { name: fromName },
        to: { name: toName },
        context,
      });
      if (kind === "none") {
        continue;
      }
      await insertTechRelation(runner.db, {
        fromTechId: fromId,
        toTechId: toId,
        kind,
      });
    }
  }
}

async function memoTechs(
  db: D1Database,
  memoId: string,
): Promise<{ id: string; name: string }[]> {
  const listed = await db
    .prepare(
      `SELECT t.id, t.name
       FROM memo_techs mt
       JOIN techs t ON t.id = mt.tech_id
       WHERE mt.memo_id = ?
       ORDER BY t.name`,
    )
    .bind(memoId)
    .all<{ id: string; name: string }>();
  return listed.results;
}

async function techIdByAlias(
  db: D1Database,
  name: string,
): Promise<string | null> {
  const key = aliasKey(name);
  if (key === null) {
    return null;
  }
  const row = await db
    .prepare("SELECT tech_id FROM tech_aliases WHERE alias_key = ?")
    .bind(key)
    .first<{ tech_id: string }>();
  return row?.tech_id ?? null;
}
