export type ModelAnnotation = {
  memoId: string;
  techId: string;
  aliases: readonly { key: string; label: string }[];
  tagIds: readonly string[];
};

export async function replaceModelAnnotations(
  db: D1Database,
  items: readonly ModelAnnotation[],
  scope: "aliases" | "tags",
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  const statements: D1PreparedStatement[] = [];
  if (scope === "aliases") {
    for (const item of items) {
      statements.push(...aliasStatements(db, item));
    }
  } else {
    const memoIds = [...new Set(items.map((item) => item.memoId))];
    for (const memoId of memoIds) {
      statements.push(
        db
          .prepare(
            "DELETE FROM memo_tags WHERE memo_id = ? AND source = 'model'",
          )
          .bind(memoId),
      );
    }
    for (const item of items) {
      statements.push(
        db
          .prepare(
            "DELETE FROM tech_tags WHERE tech_id = ? AND source = 'model'",
          )
          .bind(item.techId),
      );
    }
    for (const item of items) {
      for (const tagId of item.tagIds) {
        statements.push(
          db
            .prepare(
              `INSERT INTO tech_tags (tech_id, tag_id, source)
               VALUES (?, ?, 'model')
               ON CONFLICT(tech_id, tag_id) DO NOTHING`,
            )
            .bind(item.techId, tagId),
        );
        statements.push(
          db
            .prepare(
              `INSERT INTO memo_tags (memo_id, tag_id, source)
               VALUES (?, ?, 'model')
               ON CONFLICT(memo_id, tag_id) DO NOTHING`,
            )
            .bind(item.memoId, tagId),
        );
      }
    }
  }
  if (statements.length === 0) {
    return;
  }
  await db.batch(statements);
}

function aliasStatements(
  db: D1Database,
  item: ModelAnnotation,
): D1PreparedStatement[] {
  const keep = item.aliases.map((alias) => alias.key);
  const statements: D1PreparedStatement[] = [];
  if (keep.length === 0) {
    statements.push(
      db
        .prepare(
          `DELETE FROM tech_aliases
           WHERE tech_id = ?
             AND source = 'model'
             AND alias_key <> (SELECT name_key FROM techs WHERE id = ?)`,
        )
        .bind(item.techId, item.techId),
    );
  } else {
    const placeholders = keep.map(() => "?").join(", ");
    statements.push(
      db
        .prepare(
          `DELETE FROM tech_aliases
           WHERE tech_id = ?
             AND source = 'model'
             AND alias_key <> (SELECT name_key FROM techs WHERE id = ?)
             AND alias_key NOT IN (${placeholders})`,
        )
        .bind(item.techId, item.techId, ...keep),
    );
  }
  for (const alias of item.aliases) {
    statements.push(
      db
        .prepare(
          `INSERT INTO tech_aliases (alias_key, alias, tech_id, source)
           VALUES (?, ?, ?, 'model')
           ON CONFLICT(alias_key) DO NOTHING`,
        )
        .bind(alias.key, alias.label, item.techId),
    );
  }
  return statements;
}
