import { Button, Stack, Text, TextInput, Title } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { requestJson } from "../api";
import { MemoText } from "../components/MemoText";
import { useIsMobile } from "../hooks/useIsMobile";

type MemoListItem = {
  id: string;
  title: string;
  memoDate: string | null;
};

type MemoSearchPage = {
  memos: MemoListItem[];
  nextCursor: string | null;
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
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const qRef = useRef(q);
  qRef.current = q;

  useEffect(() => {
    const params = new URLSearchParams();
    if (q.trim().length > 0) {
      params.set("q", q.trim());
    }
    const query = params.size === 0 ? "" : `?${params.toString()}`;
    let current = true;
    void requestJson<MemoSearchPage>(`/api/memos${query}`).then((result) => {
      if (!current) {
        return;
      }
      if (!result.success) {
        setMemos([]);
        setNextCursor(null);
        setNotice(result.error?.message ?? "メモを取得できませんでした");
        return;
      }
      setNotice(null);
      setMemos(result.data.memos);
      setNextCursor(result.data.nextCursor);
    });
    return () => {
      current = false;
    };
  }, [q]);

  async function loadMore(): Promise<void> {
    if (nextCursor === null) {
      return;
    }
    const queryAtStart = q;
    const params = new URLSearchParams();
    if (queryAtStart.trim().length > 0) {
      params.set("q", queryAtStart.trim());
    }
    params.set("cursor", nextCursor);
    const result = await requestJson<MemoSearchPage>(`/api/memos?${params.toString()}`);
    if (qRef.current !== queryAtStart) {
      return;
    }
    if (!result.success) {
      setNotice(result.error?.message ?? "メモを取得できませんでした");
      return;
    }
    setNotice(null);
    setMemos((current) => [...current, ...result.data.memos]);
    setNextCursor(result.data.nextCursor);
  }

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
      {nextCursor === null ? null : (
        <Button onClick={() => void loadMore()}>続きを見る</Button>
      )}
    </Stack>
  );
}

function MemoDetailView(props: { id: string }) {
  const mobile = useIsMobile();
  const [detail, setDetail] = useState<MemoDetail | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [seenId, setSeenId] = useState(props.id);
  const idRef = useRef(props.id);
  idRef.current = props.id;
  if (seenId !== props.id) {
    setSeenId(props.id);
    setDetail(null);
    setNotice(null);
  }

  useEffect(() => {
    let current = true;
    const id = props.id;
    void loadDetail(id).then((result) => {
      if (!current || idRef.current !== id) {
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
    const memoId = props.id;
    const result = await requestJson<{ techId: string }>(`/api/mentions/promote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ memoId, name }),
    });
    if (idRef.current !== memoId) {
      return;
    }
    if (!result.success) {
      setNotice(result.error?.message ?? "格上げに失敗しました");
      return;
    }
    const loaded = await loadDetail(memoId);
    if (idRef.current !== memoId) {
      return;
    }
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
  if (detail === null || detail.id !== props.id) {
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
