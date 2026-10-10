export const TECH_STATUS_LABELS = {
  adopted: "採用中",
  want_to_try: "試したい",
  watching: "様子見",
  rejected: "見送り",
  unrated: "未評価",
} as const;

export const IMPORT_STATUS_LABELS = {
  queued: "待ち",
  processing: "処理中",
  done: "完了",
  failed: "失敗",
} as const;

export type TechStatus = keyof typeof TECH_STATUS_LABELS;
export type ImportStatusLabel = keyof typeof IMPORT_STATUS_LABELS;
