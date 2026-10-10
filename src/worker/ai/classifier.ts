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

export type SubcategoryProposal =
  | { kind: "existing"; subcategoryId: string }
  | { kind: "new"; name: string };

export type ClassificationProposal = {
  categoryId: string | null;
  subcategories: SubcategoryProposal[];
  droppedSubcategories?: number;
  confidence: number;
};

export type AcceptedClassification =
  | {
      kind: "classified";
      categoryId: string;
      subcategories: SubcategoryProposal[];
    }
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
  if (
    proposal.categoryId === null ||
    !input.categories.some((category) => category.id === proposal.categoryId)
  ) {
    return { kind: "unclassified" };
  }
  const categoryId = proposal.categoryId;
  const subcategories: SubcategoryProposal[] = [];
  const seen = new Set<string>();
  for (const item of proposal.subcategories) {
    const accepted = acceptSubcategory(item, categoryId, input.subcategories);
    if (accepted === null) {
      continue;
    }
    const key =
      accepted.kind === "existing"
        ? accepted.subcategoryId
        : `new:${normalizedSubcategoryName(accepted.name)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    subcategories.push(accepted);
  }
  const offered =
    proposal.subcategories.length + (proposal.droppedSubcategories ?? 0);
  if (offered > 0 && subcategories.length === 0) {
    return { kind: "unclassified" };
  }
  return { kind: "classified", categoryId, subcategories };
}

function acceptSubcategory(
  item: SubcategoryProposal,
  categoryId: string,
  subcategories: ClassifierInput["subcategories"],
): SubcategoryProposal | null {
  switch (item.kind) {
    case "existing": {
      const found = subcategories.find(
        (subcategory) => subcategory.id === item.subcategoryId,
      );
      if (found === undefined || found.categoryId !== categoryId) {
        return null;
      }
      return { kind: "existing", subcategoryId: found.id };
    }
    case "new": {
      const normalized = normalizedSubcategoryName(item.name);
      if (normalized.length === 0 || CATCH_ALL_NAMES.has(normalized)) {
        return null;
      }
      const existing = subcategories.find(
        (subcategory) =>
          subcategory.categoryId === categoryId &&
          normalizedSubcategoryName(subcategory.name) === normalized,
      );
      if (existing !== undefined) {
        return { kind: "existing", subcategoryId: existing.id };
      }
      return { kind: "new", name: item.name.trim() };
    }
    default: {
      const unexpected: never = item;
      throw new Error(`未知の小分類提案です: ${String(unexpected)}`);
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
