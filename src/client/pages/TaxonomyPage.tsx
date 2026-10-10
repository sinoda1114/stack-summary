import { Button, Select, Stack, Text, TextInput, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { requestJson } from "../api";
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
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void reload();
  }, []);

  async function reload(): Promise<void> {
    const [categoryBody, overview] = await Promise.all([
      requestJson<CategoryItem[]>("/api/categories"),
      requestJson<OverviewCategory[]>("/api/overview"),
    ]);
    if (!categoryBody.success || !overview.success) {
      setNotice(
        categoryBody.error?.message ?? overview.error?.message ?? "分類を取得できませんでした",
      );
      return;
    }
    setNotice(null);
    setCategories(categoryBody.data);
    setGroups(overview.data);
    setCategoryId((current) => current ?? categoryBody.data?.[0]?.id ?? null);
  }

  async function addCategory(): Promise<void> {
    const created = await requestJson<{ id: string }>("/api/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!created.success) {
      setNotice(created.error?.message ?? "大分類を追加できませんでした");
      return;
    }
    setName("");
    await reload();
  }

  async function renameCategory(id: string, next: string): Promise<void> {
    const renamed = await requestJson<{ id: string }>(`/api/categories/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    if (!renamed.success) {
      setNotice(renamed.error?.message ?? "大分類を改名できませんでした");
      return;
    }
    await reload();
  }

  async function addSubcategory(): Promise<void> {
    if (categoryId === null) {
      return;
    }
    const created = await requestJson<{ id: string }>("/api/subcategories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ categoryId, name: subName }),
    });
    if (!created.success) {
      setNotice(created.error?.message ?? "小分類を追加できませんでした");
      return;
    }
    setSubName("");
    await reload();
  }

  return (
    <Stack gap="lg">
      <Title order={1}>分類</Title>
      {notice === null ? null : <Text className="note">{notice}</Text>}
      {mobile ? <Text>この幅では管理操作を出しません。</Text> : null}
      {categories.map((category) => (
        <div key={category.id} className="section-card">
          <CategoryRow category={category} locked={mobile} onRename={renameCategory} />
        </div>
      ))}
      {mobile ? null : (
        <div className="section-card">
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
        </div>
      )}
      {groups.map((group) => (
        <div key={group.id} className="section-card">
          <Stack gap="xs">
            <Text className="section-kicker">{group.name}</Text>
            {group.subcategories.map((subcategory) => (
              <Text key={subcategory.id}>{subcategory.name}</Text>
            ))}
          </Stack>
        </div>
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

