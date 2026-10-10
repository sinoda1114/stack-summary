import { Group } from "@mantine/core";
import { Link } from "react-router";
import { useIsMobile } from "../hooks/useIsMobile";

export function AppNav() {
  const mobile = useIsMobile();
  return (
    <Group p="md" gap="md">
      <Link to="/">全体図</Link>
      <Link to="/imports">取り込み</Link>
      {mobile ? null : (
        <>
          <Link to="/inbox">受け箱</Link>
          <Link to="/taxonomy">分類</Link>
        </>
      )}
    </Group>
  );
}
