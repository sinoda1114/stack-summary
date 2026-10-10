const HTTP_URL = /https?:\/\/[^\s<>]+/g;

export function MemoText(props: { text: string }) {
  const parts: { text: string; href: string | null }[] = [];
  let last = 0;
  for (const match of props.text.matchAll(HTTP_URL)) {
    const index = match.index;
    if (index > last) {
      parts.push({ text: props.text.slice(last, index), href: null });
    }
    const href = match[0].replace(/[),.;]+$/u, "");
    parts.push({ text: href, href });
    last = index + match[0].length;
  }
  if (last < props.text.length) {
    parts.push({ text: props.text.slice(last), href: null });
  }
  return (
    <p>
      {parts.map((part, index) =>
        part.href === null ? (
          <span key={index}>{part.text}</span>
        ) : (
          <a key={index} href={part.href} rel="noopener noreferrer">
            {part.text}
          </a>
        ),
      )}
    </p>
  );
}
