import { Button, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { createImport, listImports, type ImportItem } from "../api";
import { ImportProgress } from "../components/ImportProgress";
import { useIsMobile } from "../hooks/useIsMobile";

export function ImportPage() {
  const mobile = useIsMobile();
  const [text, setText] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportItem[]>([]);

  useEffect(() => {
    void reload(setRows, setMessage);
  }, []);

  async function onSubmit(): Promise<void> {
    const result = await createImport(text, sourceLabel);
    if (!result.success) {
      setMessage(result.error?.message ?? "取り込みに失敗しました");
      return;
    }
    setMessage(submitMessage(result.httpStatus, result.data));
    setText("");
    await reload(setRows, setMessage);
  }

  return (
    <Stack p="md">
      <Title order={1}>取り込み</Title>
      {mobile ? (
        <Text>この幅では取り込みを出しません。</Text>
      ) : (
        <Stack>
          <Textarea
            label="貼り付け"
            value={text}
            onChange={(event) => setText(event.currentTarget.value)}
            minRows={8}
          />
          <TextInput
            label="出典"
            value={sourceLabel}
            onChange={(event) => setSourceLabel(event.currentTarget.value)}
          />
          <Button onClick={() => void onSubmit()}>取り込む</Button>
        </Stack>
      )}
      {message === null ? null : <Text>{message}</Text>}
      <ImportProgress rows={rows} />
    </Stack>
  );
}

function submitMessage(httpStatus: number, item: ImportItem): string {
  if (httpStatus === 202) {
    return "取り込みを開始しました";
  }
  if (item.status === "done") {
    return "同じ原文です";
  }
  if (item.status === "queued" || item.status === "processing") {
    return "処理中です";
  }
  return item.error ?? "取り込みは失敗しています";
}

async function reload(
  setRows: (rows: ImportItem[]) => void,
  setMessage: (message: string | null) => void,
): Promise<void> {
  const result = await listImports();
  if (!result.success) {
    setMessage(result.error?.message ?? "取り込み履歴を取得できませんでした");
    return;
  }
  setRows(result.data);
}
