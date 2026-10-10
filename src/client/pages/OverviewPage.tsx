import { Accordion, Group, Select, Stack, Text, TextInput, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { TECH_STATUS_LABELS, type TechStatus } from "../../shared/labels";
import { TechBadge } from "../components/TechBadge";

type OverviewCategory = {
  id: string;
  name: string;
  subcategories: {
    id: string;
    name: string;
    techs: { id: string; name: string; status: TechStatus; memoCount: number }[];
  }[];
};
import { useIsMobile } from "../hooks/useIsMobile";

export function OverviewPage() {
  const mobile = useIsMobile();
  const [status, setStatus] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [categories, setCategories] = useState<OverviewCategory[]>([]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (status) {
      params.set("status", status);
    }
    if (q.trim().length > 0) {
      params.set("q", q.trim());
    }
    const query = params.size === 0 ? "" : `?${params.toString()}`;
    void fetch(`/api/overview${query}`)
      .then((response) => response.json())
      .then((body: { success: boolean; data: OverviewCategory[] | null }) => {
        if (body.success && body.data !== null) {
          setCategories(body.data);
        }
      });
  }, [status, q]);

  const sections = categories.map((category) => (
    <Stack key={category.id} gap="xs">
      <Title order={2}>{category.name}</Title>
      {category.subcategories.map((subcategory) => (
        <Stack key={subcategory.id} gap={4}>
          {category.subcategories.length === 1 ? null : <Text>{subcategory.name}</Text>}
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
                    {category.subcategories.length === 1 ? null : <Text>{subcategory.name}</Text>}
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
