import { Button, Stack, Text, Title } from "@mantine/core";
import { useIsMobile } from "../hooks/useIsMobile";

export function ExportPage() {
  const mobile = useIsMobile();

  async function download(format: "json" | "markdown"): Promise<void> {
    const response = await fetch(`/api/export?format=${format}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = format === "json" ? "stack-summary.json" : "stack-summary.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Stack p="md">
      <Title order={1}>書き出し</Title>
      {mobile ? (
        <Text>この幅では書き出しを出しません。</Text>
      ) : (
        <Stack>
          <Button onClick={() => void download("json")}>JSON</Button>
          <Button onClick={() => void download("markdown")}>Markdown</Button>
        </Stack>
      )}
    </Stack>
  );
}
