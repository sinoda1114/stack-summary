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
    void reload(setRows);
  }, []);

  async function onSubmit(): Promise<void> {
    const result = await createImport(text, sourceLabel);
    if (!result.success || result.data === null) {
      setMessage(result.error?.message ?? "取り込みに失敗しました");
      return;
    }
    setMessage(
      result.data.status === "done" ? "同じ原文です" : "取り込みを開始しました",
    );
    setText("");
    await reload(setRows);
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

async function reload(
  setRows: (rows: ImportItem[]) => void,
): Promise<void> {
  const result = await listImports();
  if (result.success && result.data !== null) {
    setRows(result.data);
  }
}
