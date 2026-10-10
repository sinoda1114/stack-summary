import { Affix, Button, CloseButton, Group, Paper, Stack, Text, Textarea } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { askChat } from "../api";

export function ChatFab() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    const list = listRef.current;
    if (list === null) {
      return;
    }
    list.scrollTop = list.scrollHeight;
  }, [messages, pending, open]);

  async function send(): Promise<void> {
    const text = draft.trim();
    if (text.length === 0 || sending.current) {
      return;
    }
    sending.current = true;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setDraft("");
    setPending(true);
    setError(null);
    const result = await askChat(text);
    sending.current = false;
    setPending(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setMessages([...next, { role: "assistant", content: result.data.answer }]);
  }

  return (
    <Affix position={{ bottom: 20, right: 20 }} zIndex={200}>
      <Stack align="flex-end" gap="sm">
        {open ? (
          <Paper
            id="chat-panel"
            component="section"
            role="dialog"
            aria-label="問い合わせ"
            withBorder
            p="md"
            w="min(22rem, calc(100vw - 2.5rem))"
            mah="min(32rem, calc(100vh - 7rem))"
            bg="var(--mantine-color-white)"
            style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
          >
            <Group justify="space-between" wrap="nowrap">
              <Text fw={500}>問い合わせ</Text>
              <CloseButton aria-label="閉じる" onClick={() => setOpen(false)} />
            </Group>
            <div
              ref={listRef}
              style={{
                overflow: "auto",
                maxHeight: "16rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {messages.length === 0 ? (
                <Text size="sm" c="dimmed">
                  取り込んだメモと技術について聞けます。使い方は、全体図、取り込み、メモ、受け箱、分類、書き出しです。
                </Text>
              ) : (
                messages.map((message, index) => (
                  <Text
                    key={`${message.role}-${index}`}
                    size="sm"
                    style={{
                      alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "92%",
                      whiteSpace: "pre-wrap",
                      padding: "0.45rem 0.7rem",
                      border:
                        message.role === "user"
                          ? "1px solid var(--mantine-color-default-border)"
                          : "none",
                      borderLeft:
                        message.role === "assistant"
                          ? "3px solid var(--mantine-color-ash-4)"
                          : undefined,
                      background:
                        message.role === "user" ? "var(--mantine-color-body)" : "transparent",
                    }}
                  >
                    {message.content}
                  </Text>
                ))
              )}
              {pending ? (
                <Text size="sm" c="dimmed">
                  考えています
                </Text>
              ) : null}
            </div>
            {error === null ? null : (
              <Text size="sm" c="red">
                {error}
              </Text>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <Stack gap="xs">
                <Textarea
                  ref={inputRef}
                  label="質問"
                  value={draft}
                  onChange={(event) => setDraft(event.currentTarget.value)}
                  minRows={2}
                  maxRows={4}
                  maxLength={2000}
                />
                <Group justify="flex-end">
                  <Button type="submit" variant="default" disabled={pending || draft.trim().length === 0}>
                    送る
                  </Button>
                </Group>
              </Stack>
            </form>
          </Paper>
        ) : null}
        <Button
          type="button"
          variant="default"
          aria-expanded={open}
          aria-controls={open ? "chat-panel" : undefined}
          onClick={() => setOpen((value) => !value)}
        >
          問い合わせ
        </Button>
      </Stack>
    </Affix>
  );
}
