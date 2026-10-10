import { Accordion, Group, Select, Stack, Text, TextInput, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { TECH_STATUS_LABELS, type TechStatus } from "../../shared/labels";
import { isAbortError, requestJson } from "../api";
import { TechBadge } from "../components/TechBadge";
import { useIsMobile } from "../hooks/useIsMobile";

type OverviewCategory = {
  id: string;
  name: string;
  subcategoryCount: number;
  subcategories: {
    id: string;
    name: string;
    techs: { id: string; name: string; status: TechStatus; memoCount: number }[];
  }[];
};

export function OverviewPage() {
  const mobile = useIsMobile();
  const [status, setStatus] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [categories, setCategories] = useState<OverviewCategory[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (status) {
      params.set("status", status);
    }
    if (q.trim().length > 0) {
      params.set("q", q.trim());
    }
    const query = params.size === 0 ? "" : `?${params.toString()}`;
    const controller = new AbortController();
    let current = true;
    void requestJson<OverviewCategory[]>(`/api/overview${query}`, { signal: controller.signal })
      .then((result) => {
        if (!current) {
          return;
        }
        if (!result.success || result.data === null) {
          setCategories([]);
          setLoadError(result.error?.message ?? "全体図を取得できませんでした");
          return;
        }
        setLoadError(null);
        setCategories(result.data);
      })
      .catch((error: unknown) => {
        if (!current || isAbortError(error)) {
          return;
        }
        setCategories([]);
        setLoadError("通信に失敗しました");
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [status, q]);

  const sections = categories.map((category) => (
    <Stack key={category.id} gap="xs">
      <Title order={2}>{category.name}</Title>
      <CategoryBody category={category} />
    </Stack>
  ));

  return (
    <Stack p="md">
      <Title order={1}>全体図</Title>
      {loadError === null ? null : <Text>{loadError}</Text>}
      <Group>
        <Select
          label="状態"
          placeholder="すべて"
          clearable
          data={Object.entries(TECH_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          value={status}
          onChange={setStatus}
        />
        <TextInput label="キーワード" value={q} onChange={(event) => setQ(event.currentTarget.value)} />
      </Group>
      {mobile ? (
        <Accordion>
          {categories.map((category) => (
            <Accordion.Item key={category.id} value={category.id}>
              <Accordion.Control>{category.name}</Accordion.Control>
              <Accordion.Panel>
                <CategoryBody category={category} />
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      ) : (
        sections
      )}
    </Stack>
  );
}

function CategoryBody(props: { category: OverviewCategory }) {
  return (
    <>
      {props.category.subcategories.map((subcategory) => (
        <Stack key={subcategory.id} gap={4}>
          {showsSubcategoryName(props.category) ? (
            <Link to={`/subcategories/${subcategory.id}`}>{subcategory.name}</Link>
          ) : null}
          <Group>
            {subcategory.techs.map((tech) => (
              <TechBadge key={tech.id} id={tech.id} name={tech.name} status={tech.status} />
            ))}
          </Group>
        </Stack>
      ))}
    </>
  );
}

function showsSubcategoryName(category: OverviewCategory): boolean {
  return category.subcategoryCount !== 1;
}
