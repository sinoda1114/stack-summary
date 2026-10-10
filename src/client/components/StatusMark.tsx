import { Badge } from "@mantine/core";
import {
  IMPORT_STATUS_LABELS,
  TECH_STATUS_LABELS,
  type ImportStatusLabel,
  type TechStatus,
} from "../../shared/labels";
import { IMPORT_STATUS_COLOR, TECH_STATUS_COLOR, techStatusVariant } from "../statusColor";

export function TechStatusMark(props: { status: TechStatus }) {
  return (
    <Badge color={TECH_STATUS_COLOR[props.status]} variant={techStatusVariant(props.status)}>
      {TECH_STATUS_LABELS[props.status]}
    </Badge>
  );
}

export function ImportStatusMark(props: { status: ImportStatusLabel }) {
  return (
    <Badge color={IMPORT_STATUS_COLOR[props.status]} variant="light">
      {IMPORT_STATUS_LABELS[props.status]}
    </Badge>
  );
}
