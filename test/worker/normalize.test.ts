import { describe, expect, it } from "vitest";
import {
  aliasKey,
  classifyMemoBody,
  httpUrlSet,
  normalizeRawText,
  rawHash,
  sha256Hex,
} from "../../src/worker/ingest/normalize";

const HELLO_HASH =
  "185f8db32271fe25f561a6fc938b2e264306ec304eda518007d1764826381969";
const URL_SET_HASH =
  "a5ff1c84e3f85a41acc9593c9cfb1bb6be2ca3c10901522105798ef81eed3979";

describe("原文の正規化", () => {
  it("NFKC、改行、行末空白、空行、前後の空白を畳む", () => {
    expect(normalizeRawText("  Ｈｅｌｌｏ  \r\n\r\n\r\n")).toBe("Hello");
    expect(normalizeRawText("ｶ")).toBe("カ");
    expect(normalizeRawText("a\rb")).toBe("a\nb");
    expect(normalizeRawText("a\r\nb")).toBe("a\nb");
    expect(normalizeRawText("a\n\nb")).toBe("a\n\nb");
    expect(normalizeRawText("a\n\n\n\nb")).toBe("a\n\nb");
    expect(normalizeRawText("a  b")).toBe("a  b");
    expect(normalizeRawText("a\n  b")).toBe("a\n  b");
    expect(normalizeRawText("a\u3000\nb")).toBe("a\nb");
  });

  it("リンク表記を除かない", () => {
    const withLink = "see [Hono](https://hono.dev/docs)";
    expect(normalizeRawText(withLink)).toBe(withLink);
  });

  it("正規化結果の SHA-256 を raw_hash にする", async () => {
    expect(await rawHash("  Ｈｅｌｌｏ  \r\n\r\n\r\n")).toBe(HELLO_HASH);
    expect(await sha256Hex("Hello")).toBe(HELLO_HASH);

    const withLink = "docs https://hono.dev/docs";
    expect(await rawHash(withLink)).toBe(await sha256Hex(withLink));
    expect(await rawHash(withLink)).not.toBe(await rawHash("docs"));
  });
});

describe("別名キー", () => {
  it("空白、アンダースコア、ハイフンを除き、英字はロケールに依らず小文字にする", () => {
    expect(aliasKey("Workers")).toBe("workers");
    expect(aliasKey("Cloudflare Workers")).toBe("cloudflareworkers");
    expect(aliasKey("Workers")).not.toBe(aliasKey("Cloudflare Workers"));
    expect(aliasKey("Cloudflare-Workers")).toBe("cloudflareworkers");
    expect(aliasKey("Cloudflare\u00A0Workers")).toBe("cloudflareworkers");
    expect(aliasKey("Cloudflare\u3000Workers")).toBe("cloudflareworkers");
    expect(aliasKey("Worker_Previews")).toBe("workerpreviews");
    expect(aliasKey("Ｗorkers")).toBe("workers");
    expect(aliasKey("I")).toBe("i");
    expect(aliasKey("A\u2010B")).toBe("ab");
    expect(aliasKey("A\u2011B")).toBe("ab");
    expect(aliasKey("A\u2013B")).toBe("a\u2013b");
  });

  it("空になった候補はキーにしない", () => {
    expect(aliasKey("")).toBeNull();
    expect(aliasKey("  \n\t")).toBeNull();
    expect(aliasKey("-_－")).toBeNull();
    expect(aliasKey("\u3000")).toBeNull();
  });
});

describe("URL だけのメモ", () => {
  it("並び、重複、フラグメントが違っても URL 集合は同じ", async () => {
    const expected = {
      kind: "url_set" as const,
      urls: ["https://a.example", "https://b.example"],
      urlSetHash: URL_SET_HASH,
    };
    expect(
      await classifyMemoBody("https://b.example\nhttps://a.example"),
    ).toEqual(expected);
    expect(
      await classifyMemoBody("https://a.example#section https://b.example"),
    ).toEqual(expected);
    expect(
      await classifyMemoBody(
        "https://a.example\nhttps://a.example#x\nhttps://b.example",
      ),
    ).toEqual(expected);
    expect(await sha256Hex("https://a.example\nhttps://b.example")).toBe(
      URL_SET_HASH,
    );
  });

  it("http と https 以外は集合に残さない", async () => {
    const onlyHttps = await classifyMemoBody(
      "ftp://files.example/a https://a.example",
    );
    expect(onlyHttps).toEqual({
      kind: "url_set",
      urls: ["https://a.example"],
      urlSetHash: await sha256Hex("https://a.example"),
    });
    expect(await classifyMemoBody("ftp://files.example/a")).toEqual({
      kind: "body",
    });
  });

  it("本文があるメモは URL が同じでも URL 集合の同一性にしない", async () => {
    expect(await classifyMemoBody("alpha https://a.example")).toEqual({
      kind: "body",
    });
    expect(await classifyMemoBody("beta https://a.example")).toEqual({
      kind: "body",
    });
    expect(httpUrlSet("alpha https://a.example")).toEqual([
      "https://a.example",
    ]);
    expect(httpUrlSet("beta https://a.example")).toEqual(["https://a.example"]);
    expect(await classifyMemoBody("   ")).toEqual({ kind: "body" });
    expect(await classifyMemoBody("")).toEqual({ kind: "body" });
  });
});
