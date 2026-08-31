import type { DraftIngredient, DraftStep, RecipeDraft } from "@/lib/types";

export type ParsedRecipe = {
  draft: RecipeDraft;
  confidence: "high" | "low";
};

/**
 * Importação de receita por URL (PRD 4.2).
 *
 * Estratégia: procura primeiro por dados estruturados `schema.org/Recipe`
 * (JSON-LD) — presentes na maioria dos sites de receita sérios — e só cai
 * para um fallback heurístico (título da página, sem ingredientes/passos)
 * quando isso falha. O resultado NUNCA é salvo direto: sempre passa pela
 * tela de revisão antes de virar uma receita de verdade.
 */
export async function parseRecipeFromUrl(url: string): Promise<ParsedRecipe> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; MiseBot/0.1; +https://mise.app) recipe-importer",
    },
  });
  if (!response.ok) {
    throw new Error(`Não foi possível abrir a página (HTTP ${response.status}).`);
  }
  const html = await response.text();

  const recipeNode = extractRecipeJsonLd(html);
  if (recipeNode) {
    return { draft: draftFromJsonLd(recipeNode, url), confidence: "high" };
  }

  return { draft: fallbackDraft(html, url), confidence: "low" };
}

function extractRecipeJsonLd(html: string): Record<string, unknown> | null {
  const blocks = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];

  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1].trim());
    } catch {
      continue;
    }

    const candidates = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed["@graph"])
        ? (parsed["@graph"] as unknown[])
        : [parsed];

    for (const candidate of candidates) {
      if (isRecord(candidate) && hasType(candidate, "Recipe")) {
        return candidate;
      }
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasType(node: Record<string, unknown>, type: string): boolean {
  const t = node["@type"];
  if (typeof t === "string") return t.toLowerCase() === type.toLowerCase();
  if (Array.isArray(t)) return t.some((v) => String(v).toLowerCase() === type.toLowerCase());
  return false;
}

function draftFromJsonLd(node: Record<string, unknown>, url: string): RecipeDraft {
  const title = typeof node.name === "string" ? node.name : "Receita importada";
  const servings = parseServings(node.recipeYield);
  const ingredients = parseIngredients(node.recipeIngredient);
  const totalMinutes =
    parseIsoDuration(node.totalTime) ??
    (parseIsoDuration(node.prepTime) ?? 0) + (parseIsoDuration(node.cookTime) ?? 0);
  const steps = parseInstructions(node.recipeInstructions, totalMinutes);

  return {
    title,
    servings,
    tags: [],
    source_type: "url",
    source_url: url,
    ingredients,
    steps,
  };
}

function parseServings(value: unknown): number | null {
  const text = Array.isArray(value) ? value[0] : value;
  if (typeof text === "number") return text;
  if (typeof text === "string") {
    const match = text.match(/\d+/);
    return match ? Number(match[0]) : null;
  }
  return null;
}

function parseIsoDuration(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!match) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = match[2] ? Number(match[2]) : 0;
  return hours * 60 + minutes;
}

// Palavras longas vêm antes das abreviações de uma letra (kg, ml, g, l) na
// alternância: a regex casa a primeira opção que bater no começo da string
// restante, não a mais longa — "l" antes de "liters" faria "l" "vencer" e
// deixar "iters" grudado no nome do ingrediente.
const INGREDIENT_LINE =
  /^\s*([\d.,/]+)?\s*(kilograms?|kilos?|quilos?|grams?|milliliters?|millilitres?|liters?|litres?|teaspoons?|tablespoons?|xícaras?|colher(?:es)?\s+de\s+sopa|colher(?:es)?\s+de\s+chá|unidades?|dentes?|cups?|tbsp|tsp|oz|lb|kg|ml|g|l)?\s*(?:de\s+)?(.+)$/i;

function parseIngredients(value: unknown): DraftIngredient[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
    .map(parseIngredientLine);
}

/** Parses a single free-text ingredient line, e.g. "2 xícaras de farinha". */
export function parseIngredientLine(line: string): DraftIngredient {
  const match = line.match(INGREDIENT_LINE);
  if (!match) return { name: line, quantity: null, unit: null };
  const [, quantityRaw, unit, name] = match;
  return {
    name: name.trim(),
    quantity: quantityRaw ? parseFraction(quantityRaw) : null,
    unit: unit ? unit.trim() : null,
  };
}

function parseFraction(raw: string): number | null {
  const normalized = raw.replace(",", ".");
  if (normalized.includes("/")) {
    const [num, den] = normalized.split("/").map(Number);
    return den ? num / den : null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInstructions(value: unknown, totalMinutes: number): DraftStep[] {
  const lines = flattenInstructions(value);
  if (lines.length === 0) return [];

  const perStep = totalMinutes > 0 ? Math.max(1, Math.round(totalMinutes / lines.length)) : 5;
  return lines.map((description) => ({
    description,
    duration_minutes: perStep,
    starts_with_index: null,
  }));
}

function flattenInstructions(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (isRecord(item)) {
        if (typeof item.text === "string") return item.text.trim();
        if (typeof item.name === "string") return item.name.trim();
        if (Array.isArray(item.itemListElement)) {
          return flattenInstructions(item.itemListElement).join(" ");
        }
      }
      return "";
    })
    .filter(Boolean);
}

function fallbackDraft(html: string, url: string): RecipeDraft {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return {
    title: titleMatch ? titleMatch[1].trim() : "Receita importada",
    servings: null,
    tags: [],
    source_type: "url",
    source_url: url,
    ingredients: [],
    steps: [],
  };
}
