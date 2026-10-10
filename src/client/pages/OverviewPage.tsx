import { Accordion, Group, Select, Stack, Text, TextInput, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { TECH_STATUS_LABELS, type TechStatus } from "../../shared/labels";
import { TechBadge } from "../components/TechBadge";
import { useIsMobile } from "../hooks/useIsMobile";

type OverviewCategory = {
  id: string;
  name: string;
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
    void loadOverview(query, setCategories, setLoadError);
  }, [status, q]);

  const sections = categories.map((category) => (
    <Stack key={category.id} gap="xs">
      <Title order={2}>{category.name}</Title>
      {category.subcategories.map((subcategory) => (
        <Stack key={subcategory.id} gap={4}>
          {category.subcategories.length === 1 ? null : (
            <Link to={`/subcategories/${subcategory.id}`}>{subcategory.name}</Link>
          )}
          <Group>
            {subcategory.techs.map((tech) => (
              <TechBadge key={tech.id} id={tech.id} name={tech.name} status={tech.status} />
            ))}
          </Group>
        </Stack>
      ))}
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
                {category.subcategories.map((subcategory) => (
                  <Stack key={subcategory.id} gap={4}>
                    {category.subcategories.length === 1 ? null : (
                      <Link to={`/subcategories/${subcategory.id}`}>{subcategory.name}</Link>
                    )}
                    <Group>
                      {subcategory.techs.map((tech) => (
                        <TechBadge key={tech.id} id={tech.id} name={tech.name} status={tech.status} />
                      ))}
                    </Group>
                  </Stack>
                ))}
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

async function loadOverview(
  query: string,
  setCategories: (categories: OverviewCategory[]) => void,
  setLoadError: (message: string | null) => void,
): Promise<void> {
  try {
    const response = await fetch(`/api/overview${query}`);
    const body = (await response.json()) as {
      success: boolean;
      data: OverviewCategory[] | null;
      error: { message: string } | null;
    };
    if (!body.success || body.data === null) {
      setCategories([]);
      setLoadError(body.error?.message ?? "全体図を取得できませんでした");
      return;
    }
    setLoadError(null);
    setCategories(body.data);
  } catch (error) {
    setCategories([]);
    setLoadError(error instanceof SyntaxError ? "応答を読めませんでした" : "通信に失敗しました");
  }
}
