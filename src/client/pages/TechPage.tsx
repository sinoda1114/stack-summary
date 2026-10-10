import { Button, Group, Select, Stack, Text, Textarea, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { isTechStatus, TECH_STATUS_LABELS, type TechStatus } from "../../shared/labels";
import { requestJson } from "../api";
import { TechStatusMark } from "../components/StatusMark";
import { useIsMobile } from "../hooks/useIsMobile";

type TechDetail = {
  name: string;
  status: TechStatus;
  reason: string | null;
  updatedAt: string;
  aliases: { label: string }[];
  memos: {
    id: string;
    title: string;
    memoDate: string | null;
    relation: "subject" | "comparison";
  }[];
};

const RELATION_LABELS = { subject: "主題", comparison: "比較" } as const;

export function TechPage() {
  const params = useParams();
  const mobile = useIsMobile();
  const [detail, setDetail] = useState<TechDetail | null>(null);
  const [status, setStatus] = useState<TechStatus | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (params.id === undefined) {
      return;
    }
    const techId = params.id;
    let current = true;
    void requestJson<TechDetail>(`/api/techs/${techId}`).then((result) => {
      if (!current) {
        return;
      }
      if (!result.success || !isTechStatus(result.data.status)) {
        setDetail(null);
        setNotice(result.error?.message ?? "技術を取得できませんでした");
        return;
      }
      setNotice(null);
      setDetail(result.data);
      setStatus(result.data.status);
      setReason(result.data.reason ?? "");
    });
    return () => {
      current = false;
    };
  }, [params.id]);

  if (notice !== null && detail === null) {
    return <Text className="note">{notice}</Text>;
  }
  if (detail === null || status === null) {
    return <Text className="meta">読み込み中</Text>;
  }

  const selectedStatus = status;

  async function save(): Promise<void> {
    if (params.id === undefined) {
      return;
    }
    const result = await requestJson<TechDetail>(`/api/techs/${params.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: selectedStatus, reason }),
    });
    if (!result.success) {
      setNotice(result.error?.message ?? "保存に失敗しました");
      return;
    }
    setNotice(null);
    setDetail(result.data);
  }

  return (
    <Stack className="page" gap="lg">
      <Title order={1}>{detail.name}</Title>
      {notice === null ? null : <Text className="note">{notice}</Text>}
      <Text className="meta">最終更新 {detail.updatedAt}</Text>
      <Text className="meta">別名 {detail.aliases.map((alias) => alias.label).join("、")}</Text>
      {mobile ? (
        <Group gap="sm">
          <TechStatusMark status={detail.status} />
          <Text>{detail.reason ?? ""}</Text>
        </Group>
      ) : (
        <div className="section-card">
        <Stack>
          <Select
            label="状態"
            allowDeselect={false}
            data={Object.entries(TECH_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
            value={selectedStatus}
            onChange={(value) => {
              if (value !== null && isTechStatus(value)) {
                setStatus(value);
              }
            }}
          />
          <Textarea label="理由" value={reason} onChange={(event) => setReason(event.currentTarget.value)} />
          <Button onClick={() => void save()}>保存</Button>
          <MergeBox sourceId={params.id} />
        </Stack>
        </div>
      )}
      {detail.memos.length === 0 ? null : (
        <Stack gap={0} className="record-list">
          {detail.memos.map((memo) => (
            <Text key={memo.id} className="record-row">
              {memo.memoDate ?? "日付なし"} {RELATION_LABELS[memo.relation]} {memo.title}
            </Text>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function MergeBox(props: { sourceId: string | undefined }) {
  const [intoId, setIntoId] = useState<string | null>(null);
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [needsChoice, setNeedsChoice] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void requestJson<{ id: string; name: string }[]>("/api/techs").then((result) => {
      if (!current) {
        return;
      }
      if (!result.success) {
        setNotice(result.error?.message ?? "技術一覧を取得できませんでした");
        return;
      }
      setNotice(null);
      setOptions(
        result.data
          .filter((tech) => tech.id !== props.sourceId)
          .map((tech) => ({ value: tech.id, label: tech.name })),
      );
    });
    return () => {
      current = false;
    };
  }, [props.sourceId]);

  async function merge(reasonChoice?: "into" | "source"): Promise<void> {
    if (props.sourceId === undefined || intoId === null) {
      return;
    }
    const result = await requestJson<{ intoId: string }>(`/api/techs/${props.sourceId}/merge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intoId, reasonChoice }),
    });
    if (!result.success) {
      setNeedsChoice(result.error?.code === "reason_conflict");
      setNotice(result.error?.message ?? "統合できませんでした");
      return;
    }
    setNeedsChoice(false);
    setNotice("統合しました");
  }

  return (
    <Stack>
      {notice === null ? null : <Text>{notice}</Text>}
      <Select label="統合先" data={options} value={intoId} onChange={setIntoId} />
      <Button onClick={() => void merge()}>統合</Button>
      {needsChoice ? (
        <Stack>
          <Text>残す理由を選んでください</Text>
          <Button onClick={() => void merge("into")}>残す側の理由</Button>
          <Button onClick={() => void merge("source")}>統合元の理由</Button>
        </Stack>
      ) : null}
    </Stack>
  );
}
