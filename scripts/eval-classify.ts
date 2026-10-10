import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEvalSamples } from "../src/eval/eval-file.ts";
import { scoreClassification } from "../src/eval/score-classification.ts";
import { formatEvalReport, missingGoldenMessage } from "./eval-report.ts";

const [nodeMajor = 0, nodeMinor = 0] = process.versions.node.split(".").map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 6)) {
  console.error("eval:classify には Node.js 22.6 以上が必要です");
  process.exit(1);
}

const path = resolve("eval/golden.local.json");

let text: string;
try {
  text = readFileSync(path, "utf8");
} catch (error) {
  if (isEnoent(error)) {
    console.log(missingGoldenMessage());
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
