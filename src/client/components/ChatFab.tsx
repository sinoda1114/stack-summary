import { Button, CloseButton, Group, Paper, Stack, Text, Textarea } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { askChat } from "../api";
import { useIsMobile } from "../hooks/useIsMobile";

export function ChatFab() {
  const [open, setOpen] = useState(false);
  const narrow = useIsMobile();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (skipsChatAutofocus()) {
      panelRef.current?.focus();
      return;
    }
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || !narrow) {
      return;
    }
    const shell = document.querySelector(".app-shell");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (shell instanceof HTMLElement) {
      shell.setAttribute("inert", "");
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      if (shell instanceof HTMLElement) {
        shell.removeAttribute("inert");
      }
    };
  }, [open, narrow]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const dock = dockRef.current;
    const viewport = window.visualViewport;
    if (dock === null || viewport === null) {
      return;
    }
    const place = (): void => {
      const height = viewport.height;
      const offsetTop = viewport.offsetTop;
      if (!Number.isFinite(height) || !Number.isFinite(offsetTop)) {
        return;
      }
      const covered = Math.max(0, window.innerHeight - height - offsetTop);
      if (covered > 0) {
        dock.style.bottom = `${covered}px`;
        dock.style.setProperty("--chat-visible-height", `${height}px`);
        return;
      }
      dock.style.bottom = "";
      dock.style.removeProperty("--chat-visible-height");
    };
    try {
      place();
    } catch {
      return;
    }
    viewport.addEventListener("resize", place);
    viewport.addEventListener("scroll", place);
    return () => {
      viewport.removeEventListener("resize", place);
      viewport.removeEventListener("scroll", place);
      dock.style.bottom = "";
      dock.style.removeProperty("--chat-visible-height");
    };
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

  const sheet = open && narrow;
  return (
    <>
      {sheet ? <div className="chat-backdrop" onClick={() => setOpen(false)} /> : null}
      <div ref={dockRef} className={sheet ? "chat-dock chat-dock-open" : "chat-dock"}>
        <Stack align="flex-end" gap="sm">
          {open ? (
            <Paper
              ref={panelRef}
              id="chat-panel"
              className="chat-panel"
              component="section"
              role="dialog"
              aria-modal={sheet ? true : undefined}
              aria-label="AIチャット"
              tabIndex={-1}
              withBorder
              bg="var(--mantine-color-white)"
            >
              <Group className="chat-head" justify="space-between" wrap="nowrap">
                <Text fw={500}>AIチャット</Text>
                <CloseButton
                  className="chat-close"
                  size={44}
                  aria-label="閉じる"
                  onClick={() => setOpen(false)}
                />
              </Group>
              <Stack gap="sm" className="chat-body">
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
          ) : (
            <button type="button" className="chat-fab" aria-label="AIチャット" onClick={() => setOpen(true)}>
              <BubbleIcon />
            </button>
          )}
        </Stack>
      </div>
    </>
  );
}

function skipsChatAutofocus(): boolean {
  if (typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(pointer: coarse)").matches;
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
