import type { ImportStatusLabel, TechStatus } from "../shared/labels";

export const TECH_STATUS_COLOR: Record<TechStatus, string> = {
  adopted: "moss",
  want_to_try: "blue",
  watching: "ochre",
  rejected: "ash",
  unrated: "ash",
};

export function techStatusVariant(status: TechStatus): "light" | "outline" {
  return status === "unrated" ? "outline" : "light";
}

export const IMPORT_STATUS_COLOR: Record<ImportStatusLabel, string> = {
  queued: "ash",
  processing: "ochre",
  done: "moss",
  failed: "red",
};
