import { Button, Kbd, Select, Stack, Tabs, Text, TextInput, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { TECH_STATUS_LABELS, type TechStatus } from "../../shared/labels";
import { useIsMobile } from "../hooks/useIsMobile";

type InboxTech = {
  id: string;
  name: string;
  status: TechStatus;
};

type Unreviewed = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
};

type CategoryItem = { id: string; name: string };

export function InboxPage() {
  const mobile = useIsMobile();
  const [unrated, setUnrated] = useState<InboxTech[]>([]);
  const [unclassified, setUnclassified] = useState<InboxTech[]>([]);
  const [fresh, setFresh] = useState<Unreviewed[]>([]);
  const [mergeTargets, setMergeTargets] = useState<Unreviewed[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>("adopted");
  const [rename, setRename] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [intoId, setIntoId] = useState<string | null>(null);

  useEffect(() => {
    void reload();
  }, []);

  async function reload(): Promise<void> {
    const [rated, open, review, targets, categoryBody] = await Promise.all([
      readJson<InboxTech[]>("/api/inbox/unrated"),
      readJson<InboxTech[]>("/api/inbox/unclassified"),
      readJson<Unreviewed[]>("/api/inbox/subcategories"),
      readJson<Unreviewed[]>("/api/subcategories"),
      readJson<CategoryItem[]>("/api/categories"),
    ]);
    const failure =
      rated.message ??
      open.message ??
      review.message ??
      targets.message ??
      categoryBody.message;
    if (
      failure !== null ||
      rated.data === null ||
      open.data === null ||
      review.data === null ||
      targets.data === null ||
      categoryBody.data === null
    ) {
      setNotice(failure ?? "受け箱を取得できませんでした");
      return;
    }
    setNotice(null);
    setUnrated(rated.data);
    setUnclassified(open.data);
    setFresh(review.data);
    setMergeTargets(targets.data);
    setCategories(categoryBody.data);
    const first = review.data[0];
    if (first !== undefined) {
      setRename(first.name);
      setCategoryId(first.categoryId);
    }
  }

  const current = unrated[0];

  async function saveStatus(): Promise<void> {
    if (current === undefined || status === null) {
      return;
    }
    await fetch(`/api/techs/${current.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await reload();
  }

  async function confirm(id: string, patch: Record<string, unknown>): Promise<void> {
    await fetch(`/api/subcategories/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    await reload();
  }

  async function mergeFresh(id: string): Promise<void> {
    if (intoId === null) {
      return;
    }
    await fetch(`/api/subcategories/${id}/merge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intoId }),
    });
    await reload();
  }

  const firstFresh = fresh[0];

  return (
    <Stack p="md">
      <Title order={1}>受け箱</Title>
      {notice === null ? null : <Text>{notice}</Text>}
      {mobile ? <Text>この幅では管理操作を出しません。</Text> : null}
      <Tabs defaultValue="unrated">
        <Tabs.List>
          <Tabs.Tab value="unrated">未評価</Tabs.Tab>
          <Tabs.Tab value="unclassified">未分類</Tabs.Tab>
          <Tabs.Tab value="fresh">新しい小分類</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="unrated">
          {current === undefined ? (
            <Text>未評価の技術はありません。</Text>
          ) : (
            <Stack>
              <Text>
                {current.name} <Kbd>次へ</Kbd>
              </Text>
              {mobile ? (
                <Text>{TECH_STATUS_LABELS[current.status]}</Text>
              ) : (
                <Stack>
                  <Select
                    label="状態"
                    data={Object.entries(TECH_STATUS_LABELS).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                    value={status}
                    onChange={setStatus}
                  />
                  <Button onClick={() => void saveStatus()}>保存して次へ</Button>
                </Stack>
              )}
            </Stack>
          )}
        </Tabs.Panel>
        <Tabs.Panel value="unclassified">
          {unclassified.map((tech) => (
            <Text key={tech.id}>
              <Link to={`/techs/${tech.id}`}>{tech.name}</Link>
            </Text>
          ))}
        </Tabs.Panel>
        <Tabs.Panel value="fresh">
          {fresh.map((item) => (
            <Text key={item.id}>
              {item.categoryName} / {item.name}
            </Text>
          ))}
          {mobile || firstFresh === undefined ? null : (
            <Stack>
              <TextInput label="改名" value={rename} onChange={(event) => setRename(event.currentTarget.value)} />
              <Button onClick={() => void confirm(firstFresh.id, { name: rename })}>改名</Button>
              <Select
                label="移動先の大分類"
                data={categories.map((category) => ({ value: category.id, label: category.name }))}
                value={categoryId}
                onChange={setCategoryId}
              />
              <Button
                onClick={() => {
                  if (categoryId !== null) {
                    void confirm(firstFresh.id, { categoryId });
                  }
                }}
              >
                移動
              </Button>
              <Select
                label="統合先"
                data={mergeTargets
                  .filter((item) => item.id !== firstFresh.id)
                  .map((item) => ({ value: item.id, label: item.name }))}
                value={intoId}
                onChange={setIntoId}
              />
              <Button onClick={() => void mergeFresh(firstFresh.id)}>統合</Button>
              <Button onClick={() => void confirm(firstFresh.id, { reviewed: true })}>確認済み</Button>
            </Stack>
          )}
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

async function readJson<T>(
  path: string,
): Promise<{ data: T | null; message: string | null }> {
  let response: Response;
  try {
    response = await fetch(path);
  } catch {
    return { data: null, message: "通信に失敗しました" };
  }
  try {
    const body = (await response.json()) as {
      success: boolean;
      data: T | null;
      error?: { message: string } | null;
    };
    if (!body.success || body.data === null) {
      return {
        data: null,
        message: body.error?.message ?? "受け箱を取得できませんでした",
      };
    }
    return { data: body.data, message: null };
  } catch {
    return { data: null, message: "応答を読めませんでした" };
  }
}
