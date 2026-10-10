import { Button, Stack, Text, TextInput, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { requestJson } from "../api";
import { MemoText } from "../components/MemoText";
import { useIsMobile } from "../hooks/useIsMobile";

type MemoListItem = {
  id: string;
  title: string;
  memoDate: string | null;
};

type MemoDetail = {
  id: string;
  title: string;
  body: string;
  memoDate: string | null;
  techs: { id: string; name: string; relation: "subject" | "comparison" }[];
  mentions: { name: string }[];
  similars: { id: string; title: string }[];
};

const RELATION_LABELS = { subject: "主題", comparison: "比較" } as const;

export function MemoPage() {
  const params = useParams();
  if (params.id !== undefined) {
    return <MemoDetailView id={params.id} />;
  }
  return <MemoSearch />;
}

function MemoSearch() {
  const [q, setQ] = useState("");
  const [memos, setMemos] = useState<MemoListItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q.trim().length > 0) {
      params.set("q", q.trim());
    }
    const query = params.size === 0 ? "" : `?${params.toString()}`;
    let current = true;
    void requestJson<MemoListItem[]>(`/api/memos${query}`).then((result) => {
      if (!current) {
        return;
      }
      if (!result.success) {
        setMemos([]);
        setNotice(result.error?.message ?? "メモを取得できませんでした");
        return;
      }
      setNotice(null);
      setMemos(result.data);
    });
    return () => {
      current = false;
    };
  }, [q]);

  return (
    <Stack p="md">
      <Title order={1}>メモ</Title>
      {notice === null ? null : <Text>{notice}</Text>}
      <TextInput label="検索" value={q} onChange={(event) => setQ(event.currentTarget.value)} />
      {memos.map((memo) => (
        <Text key={memo.id}>
          <Link to={`/memos/${memo.id}`}>
            {memo.memoDate ?? "日付なし"} {memo.title}
          </Link>
        </Text>
      ))}
    </Stack>
  );
}

function MemoDetailView(props: { id: string }) {
  const mobile = useIsMobile();
  const [detail, setDetail] = useState<MemoDetail | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void loadDetail(props.id).then((result) => {
      if (!current) {
        return;
      }
      if (!result.success) {
        setDetail(null);
        setNotice(result.error?.message ?? "メモを取得できませんでした");
        return;
      }
      setNotice(null);
      setDetail(result.data);
    });
    return () => {
      current = false;
    };
  }, [props.id]);

  async function promote(name: string): Promise<void> {
    const result = await requestJson<{ techId: string }>(`/api/mentions/promote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ memoId: props.id, name }),
    });
    if (!result.success) {
      setNotice(result.error?.message ?? "格上げに失敗しました");
      return;
    }
    const loaded = await loadDetail(props.id);
    if (!loaded.success) {
      setNotice(loaded.error?.message ?? "メモを取得できませんでした");
      return;
    }
    setNotice(null);
    setDetail(loaded.data);
  }

  if (notice !== null && detail === null) {
    return <Text p="md">{notice}</Text>;
  }
  if (detail === null) {
    return <Text p="md">読み込み中</Text>;
  }

  return (
    <Stack p="md">
      <Title order={1}>{detail.title}</Title>
      {notice === null ? null : <Text>{notice}</Text>}
      <Text>{detail.memoDate ?? "日付なし"}</Text>
      <MemoText text={detail.body} />
      {detail.techs.map((tech) => (
        <Text key={tech.id}>
          <Link to={`/techs/${tech.id}`}>
            {RELATION_LABELS[tech.relation]} {tech.name}
          </Link>
        </Text>
      ))}
      {detail.mentions.map((mention) => (
        <Stack key={mention.name}>
          <Text>言及 {mention.name}</Text>
          {mobile ? null : (
            <Button onClick={() => void promote(mention.name)}>格上げ</Button>
          )}
        </Stack>
      ))}
      {detail.similars.map((similar) => (
        <Text key={similar.id}>
          似たメモ <Link to={`/memos/${similar.id}`}>{similar.title}</Link>
        </Text>
      ))}
    </Stack>
  );
}

function loadDetail(id: string) {
  return requestJson<MemoDetail>(`/api/memos/${id}`);
}
