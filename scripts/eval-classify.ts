import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  formatEvalReport,
  parseEvalSamples,
  scoreClassification,
} from "../src/worker/ai/score-classification.ts";

const path = resolve("eval/golden.local.json");

let text: string;
try {
  text = readFileSync(path, "utf8");
} catch (error) {
  if (isEnoent(error)) {
    console.log(
      "正解サンプルは未確定です。eval/golden.local.json はコミットしません。仮の目安は大分類 90%、小分類 80% で、未達でも次の段階は止めません。",
    );
    process.exit(0);
  }
  throw error;
}

let json: unknown;
try {
  json = JSON.parse(text) as unknown;
} catch {
  console.error("eval/golden.local.json が JSON ではありません");
  process.exit(1);
}

const parsed = parseEvalSamples(json);
if (!parsed.ok) {
  console.error(parsed.message);
  process.exit(1);
}

console.log(formatEvalReport(scoreClassification(parsed.samples)));
process.exit(0);

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
