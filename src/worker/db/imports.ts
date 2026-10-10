export type ImportStatus = "queued" | "processing" | "done" | "failed";

export type ImportRecord = {
  id: string;
  rawText: string;
  rawHash: string;
  sourceLabel: string | null;
  status: ImportStatus;
  memoCount: number;
  skippedCount: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

type ImportSqlRow = {
  id: string;
  raw_text: string;
  raw_hash: string;
  source_label: string | null;
  status: string;
  memo_count: number;
  skipped_count: number;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export async function findImportByHash(
  db: D1Database,
  rawHash: string,
): Promise<ImportRecord | null> {
  const row = await db
    .prepare("SELECT * FROM imports WHERE raw_hash = ?")
    .bind(rawHash)
    .first<ImportSqlRow>();
  return row === null ? null : toImportRecord(row);
}

export async function findImportById(
  db: D1Database,
  id: string,
): Promise<ImportRecord | null> {
  const row = await db
    .prepare("SELECT * FROM imports WHERE id = ?")
    .bind(id)
    .first<ImportSqlRow>();
  return row === null ? null : toImportRecord(row);
}

export async function listImports(
  db: D1Database,
  limit: number,
): Promise<ImportRecord[]> {
  const listed = await db
    .prepare(
      `SELECT * FROM imports
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<ImportSqlRow>();
  return listed.results.map(toImportRecord);
}

export async function insertQueuedImport(
  db: D1Database,
  input: {
    id: string;
    rawText: string;
    rawHash: string;
    sourceLabel: string | null;
    now: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO imports (
         id, raw_text, raw_hash, source_label, status, memo_count, skipped_count, error, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'queued', 0, 0, NULL, ?, ?)`,
    )
    .bind(
      input.id,
      input.rawText,
      input.rawHash,
      input.sourceLabel,
      input.now,
      input.now,
    )
    .run();
}

export async function updateImport(
  db: D1Database,
  id: string,
  patch: {
    status: ImportStatus;
    memoCount?: number;
    skippedCount?: number;
    error: string | null;
    now: string;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE imports
       SET status = ?,
           memo_count = COALESCE(?, memo_count),
           skipped_count = COALESCE(?, skipped_count),
           error = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      patch.status,
      patch.memoCount ?? null,
      patch.skippedCount ?? null,
      patch.error,
      patch.now,
      id,
    )
    .run();
}

function toImportRecord(row: ImportSqlRow): ImportRecord {
  if (!isImportStatus(row.status)) {
    throw new Error("取り込みの状態が不正です");
  }
  return {
    id: row.id,
    rawText: row.raw_text,
    rawHash: row.raw_hash,
    sourceLabel: row.source_label,
    status: row.status,
    memoCount: row.memo_count,
    skippedCount: row.skipped_count,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isImportStatus(status: string): status is ImportStatus {
  return (
    status === "queued" ||
    status === "processing" ||
    status === "done" ||
    status === "failed"
  );
}
