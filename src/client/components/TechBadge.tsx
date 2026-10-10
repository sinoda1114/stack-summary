import { Badge } from "@mantine/core";
import { Link } from "react-router";
import { TECH_STATUS_LABELS, type TechStatus } from "../../shared/labels";
import { TECH_STATUS_COLOR, techStatusVariant } from "../statusColor";

export function TechBadge(props: { id: string; name: string; status: TechStatus }) {
  return (
    <Badge
      component={Link}
      to={`/techs/${props.id}`}
      color={TECH_STATUS_COLOR[props.status]}
      variant={techStatusVariant(props.status)}
    >
      {props.name} {TECH_STATUS_LABELS[props.status]}
    </Badge>
  );
}
