import { classifyMemoBody, httpUrlSet } from "../ingest/normalize";

export type SavedMemo = {
  id: string;
  title: string;
  body: string;
  urls: string[];
};

export async function upsertSplitMemo(
  db: D1Database,
  input: {
    importId: string;
    title: string;
    body: string;
    memoDate: string | null;
    now: string;
  },
): Promise<SavedMemo> {
  const identity = await classifyMemoBody(input.body);
  const id = crypto.randomUUID();
  if (identity.kind === "url_set") {
    await db
      .prepare(
        `INSERT INTO memos (
           id, import_id, title, body, url_set_hash, memo_date, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(url_set_hash) WHERE url_set_hash IS NOT NULL DO NOTHING`,
      )
      .bind(
        id,
        input.importId,
        input.title,
        input.body,
        identity.urlSetHash,
        input.memoDate,
        input.now,
      )
      .run();
    const row = await db
      .prepare("SELECT id, body FROM memos WHERE url_set_hash = ?")
      .bind(identity.urlSetHash)
      .first<{ id: string; body: string }>();
    if (row === null) {
      throw new Error("URL だけのメモを保存できませんでした");
    }
    await replaceMemoUrls(db, row.id, identity.urls);
    return { id: row.id, title: input.title, body: row.body, urls: [...identity.urls] };
  }

  await db
    .prepare(
      `INSERT INTO memos (
         id, import_id, title, body, url_set_hash, memo_date, created_at
       ) VALUES (?, ?, ?, ?, NULL, ?, ?)
       ON CONFLICT(import_id, body) WHERE url_set_hash IS NULL DO NOTHING`,
    )
    .bind(id, input.importId, input.title, input.body, input.memoDate, input.now)
    .run();
  const row = await db
    .prepare(
      `SELECT id FROM memos
       WHERE import_id = ? AND body = ? AND url_set_hash IS NULL`,
    )
    .bind(input.importId, input.body)
    .first<{ id: string }>();
  if (row === null) {
    throw new Error("メモを保存できませんでした");
  }
  const urls = httpUrlSet(input.body);
  await replaceMemoUrls(db, row.id, urls);
  await linkSimilarMemos(db, row.id, urls);
  return { id: row.id, title: input.title, body: input.body, urls };
}

async function replaceMemoUrls(
  db: D1Database,
  memoId: string,
  urls: readonly string[],
): Promise<void> {
  if (urls.length === 0) {
    return;
  }
  await db.batch(
    urls.map((url) =>
      db
        .prepare(
          `INSERT INTO memo_urls (memo_id, url)
           VALUES (?, ?)
           ON CONFLICT(memo_id, url) DO NOTHING`,
        )
        .bind(memoId, url),
    ),
  );
}

async function linkSimilarMemos(
  db: D1Database,
  memoId: string,
  urls: readonly string[],
): Promise<void> {
  const others = new Set<string>();
  for (const url of urls) {
    const listed = await db
      .prepare(
        `SELECT memo_id FROM memo_urls
         WHERE url = ? AND memo_id <> ?`,
      )
      .bind(url, memoId)
      .all<{ memo_id: string }>();
    for (const row of listed.results) {
      others.add(row.memo_id);
    }
  }
  if (others.size === 0) {
    return;
  }
  const statements: D1PreparedStatement[] = [];
  for (const otherId of others) {
    statements.push(similarInsert(db, memoId, otherId));
    statements.push(similarInsert(db, otherId, memoId));
  }
  await db.batch(statements);
}

function similarInsert(
  db: D1Database,
  memoId: string,
  similarMemoId: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO memo_similars (memo_id, similar_memo_id)
       VALUES (?, ?)
       ON CONFLICT(memo_id, similar_memo_id) DO NOTHING`,
    )
    .bind(memoId, similarMemoId);
}
