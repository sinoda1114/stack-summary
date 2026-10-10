import { Accordion, Group, Select, Stack, Text, TextInput, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { TECH_STATUS_LABELS, type TechStatus } from "../../shared/labels";
import { isAbortError, requestJson } from "../api";
import { TechBadge } from "../components/TechBadge";
import { useIsMobile } from "../hooks/useIsMobile";

type OverviewTech = {
  id: string;
  name: string;
  status: TechStatus;
  memoCount: number;
};

type OverviewCategory = {
  id: string;
  name: string;
  subcategoryCount: number;
  subcategories: {
    id: string;
    name: string;
    techs: OverviewTech[];
  }[];
  ungrouped?: OverviewTech[];
};

const filterFieldStyle = { width: "16rem", maxWidth: "100%" };

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
        if (!result.success) {
          setCategories([]);
          setLoadError(result.error.message);
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
    <div key={category.id} className="section-card">
      <Stack gap="md">
        <Title order={2}>{category.name}</Title>
        <CategoryBody category={category} />
      </Stack>
    </div>
  ));

  return (
    <Stack gap="lg">
      <Title order={1}>全体図</Title>
      {loadError === null ? null : <Text className="note">{loadError}</Text>}
      <Group align="flex-end" gap="md">
        <Select
          label="状態"
          placeholder="すべて"
          clearable
          data={Object.entries(TECH_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          value={status}
          onChange={setStatus}
          style={filterFieldStyle}
        />
        <TextInput
          label="キーワード"
          value={q}
          onChange={(event) => setQ(event.currentTarget.value)}
          style={filterFieldStyle}
        />
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
  const ungrouped = props.category.ungrouped ?? [];
  const showNames = props.category.subcategoryCount !== 1 || ungrouped.length > 0;
  return (
    <>
      {props.category.subcategories.map((subcategory) => (
        <Stack key={subcategory.id} gap="xs" className="subcategory">
          {showNames ? (
            <Text className="subhead">
              <Link to={`/subcategories/${subcategory.id}`}>{subcategory.name}</Link>
            </Text>
          ) : null}
          <Group gap="xs">
            {subcategory.techs.map((tech) => (
              <TechBadge key={tech.id} id={tech.id} name={tech.name} status={tech.status} />
            ))}
          </Group>
        </Stack>
      ))}
      {ungrouped.length === 0 ? null : (
        <Stack gap="xs" className="subcategory">
          <Text className="subhead">小分類なし</Text>
          <Group gap="xs">
            {ungrouped.map((tech) => (
              <TechBadge key={tech.id} id={tech.id} name={tech.name} status={tech.status} />
            ))}
          </Group>
        </Stack>
      )}
    </>
  );
}
