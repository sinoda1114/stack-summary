export const NAME_MATCH_LIMIT = 12;

export const MIN_NEAR_KEY_LENGTH = 3;

const COMPACT_KEY = /[^\p{Letter}\p{Number}]/gu;

export type AliasRow = {
  id: string;
  name: string;
  alias: string;
  aliasKey: string;
};

export type NameCandidate = {
  id: string;
  name: string;
  aliases: string[];
};

export function compactAliasKey(key: string): string {
  return key.replace(COMPACT_KEY, "");
}

export function isNearAliasKey(left: string, right: string): boolean {
  if (left === right) {
    return false;
  }
  const compactLeft = compactAliasKey(left);
  const compactRight = compactAliasKey(right);
  if (compactLeft.length === 0 || compactRight.length === 0) {
    return false;
  }
  if (compactLeft === compactRight) {
    return true;
  }
  const shorter =
    compactLeft.length <= compactRight.length ? compactLeft : compactRight;
  const longer =
    compactLeft.length <= compactRight.length ? compactRight : compactLeft;
  return (
    shorter.length >= MIN_NEAR_KEY_LENGTH && longer.includes(shorter)
  );
}

export function rankNameCandidates(
  incomingKeys: readonly string[],
  rows: readonly AliasRow[],
  limit: number,
): NameCandidate[] {
  const grouped = new Map<
    string,
    { id: string; name: string; aliases: Map<string, string>; score: number }
  >();
  for (const row of rows) {
    let score = 0;
    for (const key of incomingKeys) {
      const near = nearScore(key, row.aliasKey);
      if (near > score) {
        score = near;
      }
    }
    if (score === 0) {
      continue;
    }
    const current = grouped.get(row.id) ?? {
      id: row.id,
      name: row.name,
      aliases: new Map<string, string>(),
      score: 0,
    };
    current.aliases.set(row.aliasKey, row.alias);
    if (score > current.score) {
      current.score = score;
    }
    grouped.set(row.id, current);
  }
  return [...grouped.values()]
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (left.id < right.id) {
        return -1;
      }
      if (left.id > right.id) {
        return 1;
      }
      return 0;
    })
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      name: item.name,
      aliases: [...item.aliases.values()],
    }));
}

export async function listAliasRows(db: D1Database): Promise<AliasRow[]> {
  const listed = await db
    .prepare(
      `SELECT t.id AS id, t.name AS name, a.alias AS alias, a.alias_key AS alias_key
       FROM tech_aliases AS a
       JOIN techs AS t ON t.id = a.tech_id`,
    )
    .all<{ id: string; name: string; alias: string; alias_key: string }>();
  return listed.results.map((row) => ({
    id: row.id,
    name: row.name,
    alias: row.alias,
    aliasKey: row.alias_key,
  }));
}

function nearScore(left: string, right: string): number {
  if (!isNearAliasKey(left, right)) {
    return 0;
  }
  const compactLeft = compactAliasKey(left);
  const compactRight = compactAliasKey(right);
  if (compactLeft === compactRight) {
    return compactLeft.length + 1000;
  }
  return Math.min(compactLeft.length, compactRight.length);
}
