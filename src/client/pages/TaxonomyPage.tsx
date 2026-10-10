import { Button, Select, Stack, Text, TextInput, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { useIsMobile } from "../hooks/useIsMobile";

type CategoryItem = { id: string; name: string; sortOrder: number };
type OverviewCategory = {
  id: string;
  name: string;
  subcategories: { id: string; name: string }[];
};

export function TaxonomyPage() {
  const mobile = useIsMobile();
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [groups, setGroups] = useState<OverviewCategory[]>([]);
  const [name, setName] = useState("");
  const [subName, setSubName] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  useEffect(() => {
    void reload();
  }, []);

  async function reload(): Promise<void> {
    const [categoryBody, overview] = await Promise.all([
      readJson<CategoryItem[]>("/api/categories"),
      readJson<OverviewCategory[]>("/api/overview"),
    ]);
    setCategories(categoryBody ?? []);
    setGroups(overview ?? []);
    setCategoryId((current) => current ?? categoryBody?.[0]?.id ?? null);
  }

  async function addCategory(): Promise<void> {
    await fetch("/api/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setName("");
    await reload();
  }

  async function renameCategory(id: string, next: string): Promise<void> {
    await fetch(`/api/categories/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    await reload();
  }

  async function addSubcategory(): Promise<void> {
    if (categoryId === null) {
      return;
    }
    await fetch("/api/subcategories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ categoryId, name: subName }),
    });
    setSubName("");
    await reload();
  }

  return (
    <Stack p="md">
      <Title order={1}>分類</Title>
      {mobile ? <Text>この幅では管理操作を出しません。</Text> : null}
      {categories.map((category) => (
        <CategoryRow key={category.id} category={category} locked={mobile} onRename={renameCategory} />
      ))}
      {mobile ? null : (
        <Stack>
          <TextInput label="大分類を追加" value={name} onChange={(event) => setName(event.currentTarget.value)} />
          <Button onClick={() => void addCategory()}>大分類を追加</Button>
          <Select
            label="小分類を置く大分類"
            data={categories.map((category) => ({ value: category.id, label: category.name }))}
            value={categoryId}
            onChange={setCategoryId}
          />
          <TextInput label="小分類名" value={subName} onChange={(event) => setSubName(event.currentTarget.value)} />
          <Button onClick={() => void addSubcategory()}>小分類を追加</Button>
        </Stack>
      )}
      {groups.map((group) => (
        <Stack key={group.id}>
          <Text>{group.name}</Text>
          {group.subcategories.map((subcategory) => (
            <Text key={subcategory.id}>{subcategory.name}</Text>
          ))}
        </Stack>
      ))}
    </Stack>
  );
}

function CategoryRow(props: {
  category: CategoryItem;
  locked: boolean;
  onRename: (id: string, name: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(props.category.name);
  if (props.locked) {
    return (
      <Text>
        {props.category.sortOrder} {props.category.name}
      </Text>
    );
  }
  return (
    <Stack>
      <TextInput label="大分類名" value={draft} onChange={(event) => setDraft(event.currentTarget.value)} />
      <Button onClick={() => void props.onRename(props.category.id, draft)}>改名</Button>
    </Stack>
  );
}

async function readJson<T>(path: string): Promise<T | null> {
  const response = await fetch(path);
  const body = (await response.json()) as { success: boolean; data: T | null };
  return body.success ? body.data : null;
}
