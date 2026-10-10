import { TECH_STATUS_LABELS, type TechStatus } from "../../shared/labels";

const MEMO_LIMIT = 40;
const TECH_LIMIT = 80;
const BODY_LIMIT = 400;
const REASON_LIMIT = 200;

export type InquiryMemo = {
  title: string;
  body: string;
  memoDate: string | null;
};

export type InquiryTech = {
  name: string;
  status: string;
  reason: string | null;
};

export type InquiryContext = {
  memos: InquiryMemo[];
  techs: InquiryTech[];
  memoTruncated: boolean;
  techTruncated: boolean;
};

export async function loadInquiryContext(db: D1Database): Promise<InquiryContext> {
  const memos = await db
    .prepare(
      `SELECT title, body, memo_date
       FROM memos
       ORDER BY memo_date DESC, created_at DESC
       LIMIT ?`,
    )
    .bind(MEMO_LIMIT + 1)
    .all<{ title: string; body: string; memo_date: string | null }>();
  const techs = await db
    .prepare(
      `SELECT name, status, reason
       FROM techs
       ORDER BY updated_at DESC, name ASC
       LIMIT ?`,
    )
    .bind(TECH_LIMIT + 1)
    .all<{ name: string; status: TechStatus; reason: string | null }>();
  return {
    memos: memos.results.slice(0, MEMO_LIMIT).map((memo) => ({
      title: memo.title,
      body: clip(memo.body, BODY_LIMIT),
      memoDate: memo.memo_date,
    })),
    techs: techs.results.slice(0, TECH_LIMIT).map((tech) => ({
      name: tech.name,
      status: TECH_STATUS_LABELS[tech.status],
      reason: tech.reason === null ? null : clip(tech.reason, REASON_LIMIT),
    })),
    memoTruncated: memos.results.length > MEMO_LIMIT,
    techTruncated: techs.results.length > TECH_LIMIT,
  };
}

function clip(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}…`;
}
