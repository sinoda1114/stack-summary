export type ClassifierInput = {
  tech: { name: string; context: string };
  categories: { id: string; name: string }[];
  subcategories: {
    id: string;
    categoryId: string;
    name: string;
    examples: string[];
  }[];
};

export type ClassificationProposal =
  | { kind: "existing"; subcategoryId: string; confidence: number }
  | { kind: "new"; categoryId: string; name: string; confidence: number }
  | { kind: "unclassified"; confidence: number };

export type AcceptedClassification =
  | { kind: "existing"; subcategoryId: string }
  | { kind: "new"; categoryId: string; name: string }
  | { kind: "unclassified" };

export type Classifier = {
  version: string;
  classify(input: ClassifierInput): Promise<ClassificationProposal>;
};

const CATCH_ALL_NAMES = new Set([
  "その他",
  "その他の技術",
  "未分類",
  "不明",
  "other",
  "others",
  "misc",
  "miscellaneous",
  "uncategorized",
]);

export function normalizedSubcategoryName(name: string): string {
  return name.normalize("NFKC").replace(/\p{White_Space}/gu, "").toLowerCase();
}

export function acceptClassification(
  proposal: ClassificationProposal,
  input: Pick<ClassifierInput, "categories" | "subcategories">,
): AcceptedClassification {
  switch (proposal.kind) {
    case "unclassified":
      return { kind: "unclassified" };
    case "existing":
      if (
        !input.subcategories.some(
          (subcategory) => subcategory.id === proposal.subcategoryId,
        )
      ) {
        return { kind: "unclassified" };
      }
      return { kind: "existing", subcategoryId: proposal.subcategoryId };
    case "new":
      if (
        !input.categories.some(
          (category) => category.id === proposal.categoryId,
        )
      ) {
        return { kind: "unclassified" };
      }
      const normalized = normalizedSubcategoryName(proposal.name);
      if (normalized.length === 0 || CATCH_ALL_NAMES.has(normalized)) {
        return { kind: "unclassified" };
      }
      return {
        kind: "new",
        categoryId: proposal.categoryId,
        name: proposal.name,
      };
    default: {
      const unexpected: never = proposal;
      throw new Error(`未知の分類提案です: ${String(unexpected)}`);
    }
  }
}

export async function classifyTech(
  classifier: Classifier,
  input: ClassifierInput,
): Promise<AcceptedClassification> {
  const proposal = await classifier.classify(input);
  return acceptClassification(proposal, input);
}
