import { Button, Select, Stack, Text, Textarea, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { TECH_STATUS_LABELS, type TechStatus } from "../../shared/labels";
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
  const [status, setStatus] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (params.id === undefined) {
      return;
    }
    void fetch(`/api/techs/${params.id}`)
      .then((response) => response.json())
      .then((body: { success: boolean; data: TechDetail | null }) => {
        if (body.success && body.data !== null) {
          setDetail(body.data);
          setStatus(body.data.status);
          setReason(body.data.reason ?? "");
        }
      });
  }, [params.id]);

  if (detail === null) {
    return <Text p="md">読み込み中</Text>;
  }

  async function save(): Promise<void> {
    if (params.id === undefined || status === null) {
      return;
    }
    const response = await fetch(`/api/techs/${params.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, reason }),
    });
    const body = (await response.json()) as { success: boolean; data: TechDetail | null };
    if (body.success && body.data !== null) {
      setDetail(body.data);
    }
  }

  return (
    <Stack p="md">
      <Title order={1}>{detail.name}</Title>
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
            data={Object.entries(TECH_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
            value={status}
            onChange={setStatus}
          />
          <Textarea label="理由" value={reason} onChange={(event) => setReason(event.currentTarget.value)} />
          <Button onClick={() => void save()}>保存</Button>
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
