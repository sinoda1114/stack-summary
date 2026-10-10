import { Button, CloseButton, Group, Paper, Stack, Text, Textarea } from "@mantine/core";
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
    <div className="chat-dock">
      <Stack align="flex-end" gap="sm">
        {open ? (
          <Paper
            id="chat-panel"
            className="chat-panel"
            component="section"
            role="dialog"
            aria-label="AIチャット"
            withBorder
            p="md"
            bg="var(--mantine-color-white)"
          >
            <Stack gap="sm" className="chat-body">
              <Group justify="space-between" wrap="nowrap">
                <Text fw={500}>AIチャット</Text>
                <CloseButton aria-label="閉じる" onClick={() => setOpen(false)} />
              </Group>
              <div ref={listRef} className="chat-log">
                {messages.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    取り込んだメモと技術について聞けます。使い方は、全体図、取り込み、メモ、受け箱、分類、書き出しです。
                  </Text>
                ) : (
                  messages.map((message, index) => (
                    <Text
                      key={`${message.role}-${index}`}
                      size="sm"
                      className={message.role === "user" ? "chat-ask" : "note chat-answer"}
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
                    <Button
                      type="submit"
                      variant="default"
                      disabled={pending || draft.trim().length === 0}
                    >
                      送る
                    </Button>
                  </Group>
                </Stack>
              </form>
            </Stack>
          </Paper>
        ) : null}
        <button
          type="button"
          className="chat-fab"
          aria-label="AIチャット"
          aria-expanded={open}
          aria-controls={open ? "chat-panel" : undefined}
          onClick={() => setOpen((value) => !value)}
        >
          <BubbleIcon />
        </button>
      </Stack>
    </div>
  );
}

function BubbleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6.2 16.6 4.2 19.4V7.6A2.4 2.4 0 0 1 6.6 5.2h10.8a2.4 2.4 0 0 1 2.4 2.4v6.6a2.4 2.4 0 0 1-2.4 2.4H8.1z" />
    </svg>
  );
}
