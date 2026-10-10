import { Button, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import { requestBlob } from "../api";
import { useIsMobile } from "../hooks/useIsMobile";

export function ExportPage() {
  const mobile = useIsMobile();
  const [notice, setNotice] = useState<string | null>(null);

  async function download(format: "json" | "markdown"): Promise<void> {
    const result = await requestBlob(`/api/export?format=${format}`);
    if (!result.success) {
      setNotice(result.error?.message ?? "書き出しに失敗しました");
      return;
    }
    setNotice(null);
    const url = URL.createObjectURL(result.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = format === "json" ? "stack-summary.json" : "stack-summary.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Stack className="page" gap="lg">
      <Title order={1}>書き出し</Title>
      {notice === null ? null : <Text className="note">{notice}</Text>}
      {mobile ? (
        <Text>この幅では書き出しを出しません。</Text>
      ) : (
        <div className="section-card">
        <Stack>
          <Button onClick={() => void download("json")}>JSON</Button>
          <Button onClick={() => void download("markdown")}>Markdown</Button>
        </Stack>
        </div>
      )}
    </Stack>
  );
}
