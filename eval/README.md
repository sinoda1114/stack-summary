# 分類の評価（仮）

正解サンプルは未確定です。`eval/golden.local.json` はローカルだけに置き、リポジトリへコミットしません。

仮の目安は大分類 90%、小分類 80% です。届かなくても次の段階は止めません。このスクリプトは、目安を下回っても終了コード 0 で終わります。

ファイルが無いとき:

```bash
npm run eval:classify
```

表示は「正解サンプルは未確定」です。終了コードは 0 です。

ファイルがあるときの形:

```json
{
  "samples": [
    {
      "name": "Hono",
      "context": "ルータとして使う",
      "expected": { "categoryId": "backend", "subcategoryId": null },
      "predicted": { "categoryId": "backend", "subcategoryId": null }
    }
  ]
}
```

`predicted` が無い行は採点しません。本番の Gemini はこの段階では呼びません。
