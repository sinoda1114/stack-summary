import { Button, Select, Stack, Text, Textarea, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { isTechStatus, TECH_STATUS_LABELS, type TechStatus } from "../../shared/labels";
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
    void loadTech(techId, setDetail, setStatus, setReason, setNotice);
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
    try {
      const response = await fetch(`/api/techs/${params.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: selectedStatus, reason }),
      });
      const body = (await response.json()) as {
        success: boolean;
        data: TechDetail | null;
        error: { message: string } | null;
      };
      if (!body.success || body.data === null) {
        setNotice(body.error?.message ?? "保存に失敗しました");
        return;
      }
      setNotice(null);
      setDetail(body.data);
    } catch (error) {
      setNotice(readFailure(error, "保存に失敗しました"));
    }
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

async function loadTech(
  techId: string,
  setDetail: (detail: TechDetail | null) => void,
  setStatus: (status: TechStatus) => void,
  setReason: (reason: string) => void,
  setNotice: (notice: string | null) => void,
): Promise<void> {
  try {
    const response = await fetch(`/api/techs/${techId}`);
    const body = (await response.json()) as {
      success: boolean;
      data: TechDetail | null;
      error: { message: string } | null;
    };
    if (!body.success || body.data === null || !isTechStatus(body.data.status)) {
      setDetail(null);
      setNotice(body.error?.message ?? "技術を取得できませんでした");
      return;
    }
    setNotice(null);
    setDetail(body.data);
    setStatus(body.data.status);
    setReason(body.data.reason ?? "");
  } catch (error) {
    setDetail(null);
    setNotice(readFailure(error));
  }
}

function readFailure(error: unknown, fallback = "通信に失敗しました"): string {
  if (error instanceof SyntaxError) {
    return "応答を読めませんでした";
  }
  return error instanceof TypeError ? "通信に失敗しました" : fallback;
}
