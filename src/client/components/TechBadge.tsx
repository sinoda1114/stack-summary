import { Badge } from "@mantine/core";
import { Link } from "react-router";
import { TECH_STATUS_LABELS, type TechStatus } from "../../shared/labels";

const COLORS: Record<TechStatus, string> = {
  adopted: "green",
  want_to_try: "blue",
  watching: "yellow",
  rejected: "gray",
  unrated: "gray",
};

export function TechBadge(props: { id: string; name: string; status: TechStatus }) {
  return (
    <Badge component={Link} to={`/techs/${props.id}`} color={COLORS[props.status]} variant="light">
      {props.name} {TECH_STATUS_LABELS[props.status]}
    </Badge>
  );
}
