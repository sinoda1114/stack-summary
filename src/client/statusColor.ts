import type { ImportStatusLabel, TechStatus } from "../shared/labels";

export const TECH_STATUS_COLOR: Record<TechStatus, string> = {
  adopted: "green",
  want_to_try: "blue",
  watching: "yellow",
  rejected: "gray",
  unrated: "gray",
};

export function techStatusVariant(status: TechStatus): "light" | "outline" {
  return status === "unrated" ? "outline" : "light";
}

export const IMPORT_STATUS_COLOR: Record<ImportStatusLabel, string> = {
  queued: "gray",
  processing: "yellow",
  done: "green",
  failed: "red",
};
