import { Button, Select, Stack, Text, Textarea, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { isTechStatus, TECH_STATUS_LABELS, type TechStatus } from "../../shared/labels";
import { requestJson } from "../api";
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
      const data = result.success ? result.data : null;
      if (data === null || !isTechStatus(data.status)) {
        setDetail(null);
        setNotice(result.error?.message ?? "技術を取得できませんでした");
        return;
      }
      setNotice(null);
      setDetail(data);
      setStatus(data.status);
      setReason(data.reason ?? "");
    });
    return () => {
      current = false;
    };
  }, [params.id]);

  if (notice !== null && detail === null) {
    return <Text p="md">{notice}</Text>;
  }
  if (detail === null || status === null) {
    return <Text p="md">読み込み中</Text>;
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
    if (!result.success || result.data === null) {
      setNotice(result.error?.message ?? "保存に失敗しました");
      return;
    }
    setNotice(null);
    setDetail(result.data);
  }

  return (
    <Stack p="md">
      <Title order={1}>{detail.name}</Title>
      {notice === null ? null : <Text>{notice}</Text>}
      <Text>最終更新 {detail.updatedAt}</Text>
      <Text>別名 {detail.aliases.map((alias) => alias.label).join("、")}</Text>
      {mobile ? (
        <Text>
          {TECH_STATUS_LABELS[detail.status]} {detail.reason ?? ""}
        </Text>
      ) : (
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
      )}
      <Stack>
        {detail.memos.map((memo) => (
          <Text key={memo.id}>
            {memo.memoDate ?? "日付なし"} {RELATION_LABELS[memo.relation]} {memo.title}
          </Text>
        ))}
      </Stack>
    </Stack>
  );
}

type OverviewTechList = {
  subcategories: { techs: { id: string; name: string }[] }[];
}[];

function MergeBox(props: { sourceId: string | undefined }) {
  const [intoId, setIntoId] = useState<string | null>(null);
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [needsChoice, setNeedsChoice] = useState(false);

  useEffect(() => {
    let current = true;
    void requestJson<OverviewTechList>("/api/overview").then((result) => {
      if (!current || !result.success || result.data === null) {
        return;
      }
      const next: { value: string; label: string }[] = [];
      for (const category of result.data) {
        for (const subcategory of category.subcategories) {
          for (const tech of subcategory.techs) {
            if (tech.id !== props.sourceId) {
              next.push({ value: tech.id, label: tech.name });
            }
          }
        }
      }
      setOptions(next);
    });
    return () => {
      current = false;
    };
  }, [props.sourceId]);

  async function merge(reasonChoice?: "into" | "source"): Promise<void> {
    if (props.sourceId === undefined || intoId === null) {
      return;
    }
    const response = await fetch(`/api/techs/${props.sourceId}/merge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intoId, reasonChoice }),
    });
    setNeedsChoice(response.status === 409);
  }

  return (
    <Stack>
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
