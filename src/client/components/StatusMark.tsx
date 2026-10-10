import type { CSSProperties } from "react";
import {
  IMPORT_STATUS_LABELS,
  TECH_STATUS_LABELS,
  type ImportStatusLabel,
  type TechStatus,
} from "../../shared/labels";

const TONE = {
  moss: { color: "#314826", background: "#e7f0e0", borderColor: "#c5d4b6" },
  seal: { color: "#7f2f25", background: "#f8ebe6", borderColor: "#e6cdc4" },
  ochre: { color: "#624c16", background: "#f8f0d8", borderColor: "#e6d09a" },
  ash: { color: "#47433b", background: "#f4f1ea", borderColor: "#d4cec3" },
} as const satisfies Record<string, CSSProperties>;

type ToneName = keyof typeof TONE;

const TECH_TONE: Record<TechStatus, ToneName> = {
  adopted: "moss",
  want_to_try: "seal",
  watching: "ochre",
  rejected: "ash",
  unrated: "ash",
};

const IMPORT_TONE: Record<ImportStatusLabel, ToneName> = {
  queued: "ash",
  processing: "ochre",
  done: "moss",
  failed: "seal",
};

export function TechStatusMark(props: { status: TechStatus }) {
  return <Mark tone={TECH_TONE[props.status]} label={TECH_STATUS_LABELS[props.status]} />;
}

export function ImportStatusMark(props: { status: ImportStatusLabel }) {
  return <Mark tone={IMPORT_TONE[props.status]} label={IMPORT_STATUS_LABELS[props.status]} />;
}

function Mark(props: { tone: ToneName; label: string }) {
  return (
    <span className="status-mark" style={TONE[props.tone]}>
      {props.label}
    </span>
  );
}
