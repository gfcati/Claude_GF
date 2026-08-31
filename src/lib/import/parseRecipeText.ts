import type { DraftStep, RecipeDraft } from "@/lib/types";
import { parseIngredientLine, type ParsedRecipe } from "@/lib/import/parseRecipe";

/**
 * Importação de receita a partir de texto colado (ex.: anotações, mensagem
 * de WhatsApp, receita de família sem link). Sem dados estruturados para se
 * apoiar, a extração é puramente heurística — por isso, assim como a
 * importação por URL, o resultado sempre passa pela tela de revisão antes
 * de virar uma receita de verdade.
 */

const INGREDIENTS_HEADING = /^(ingredientes|ingredients)\s*:?\s*$/i;
const STEPS_HEADING =
  /^(modo de preparo|modo de fazer|preparo|instru[cç][oõ]es|passo a passo|passos|steps|instructions|directions|method)\s*:?\s*$/i;
const TITLE_LABEL = /^(t[ií]tulo|receita)\s*:\s*/i;
const SERVINGS_PATTERN = /(?:rende|serve|serves|por[cç][oõ]es?)\s*:?\s*(\d+)/i;
const LIST_MARKER = /^(?:[-*•]|\d+[.)])\s*/;
const NUMBERED_LINE = /^\d+[.)]\s+/;

export function parseRecipeFromText(text: string): ParsedRecipe {
  const lines = text.split(/\r\n|\r|\n/).map((line) => line.trim());

  const ingredientsHeadingIndex = lines.findIndex((line) => INGREDIENTS_HEADING.test(line));
  const stepsHeadingIndex = lines.findIndex((line) => STEPS_HEADING.test(line));

  const titleSearchEnd =
    ingredientsHeadingIndex !== -1
      ? ingredientsHeadingIndex
      : stepsHeadingIndex !== -1
        ? stepsHeadingIndex
        : lines.length;
  const titleLine = lines.slice(0, titleSearchEnd).find((line) => line.length > 0);
  const title = titleLine ? titleLine.replace(TITLE_LABEL, "").trim() : "Receita importada";

  const servingsMatch = text.match(SERVINGS_PATTERN);
  const servings = servingsMatch ? Number(servingsMatch[1]) : null;

  let ingredientLines: string[] = [];
  let stepLines: string[] = [];

  if (ingredientsHeadingIndex !== -1) {
    const end =
      stepsHeadingIndex !== -1 && stepsHeadingIndex > ingredientsHeadingIndex
        ? stepsHeadingIndex
        : lines.length;
    ingredientLines = lines.slice(ingredientsHeadingIndex + 1, end).filter(Boolean);
  }
  if (stepsHeadingIndex !== -1) {
    stepLines = lines.slice(stepsHeadingIndex + 1).filter(Boolean);
  }

  if (ingredientsHeadingIndex === -1 && stepsHeadingIndex === -1) {
    const guess = guessSectionsWithoutHeadings(lines);
    ingredientLines = guess.ingredientLines;
    stepLines = guess.stepLines;
  }

  const ingredients = ingredientLines
    .map((line) => line.replace(LIST_MARKER, "").trim())
    .filter(Boolean)
    .map(parseIngredientLine);

  const steps: DraftStep[] = stepLines
    .map((line) => line.replace(LIST_MARKER, "").trim())
    .filter(Boolean)
    .map((description) => ({ description, duration_minutes: 5, starts_with_index: null }));

  const draft: RecipeDraft = {
    title,
    servings,
    tags: [],
    source_type: "manual",
    source_url: null,
    ingredients: ingredients.length > 0 ? ingredients : [{ name: "", quantity: null, unit: null }],
    steps:
      steps.length > 0 ? steps : [{ description: "", duration_minutes: 5, starts_with_index: null }],
  };

  return {
    draft,
    confidence: ingredients.length > 0 && steps.length > 0 ? "high" : "low",
  };
}

/**
 * Sem cabeçalhos "Ingredientes" / "Modo de preparo", usa a primeira linha
 * numerada como divisor: tudo antes (exceto o título) vira ingrediente,
 * tudo a partir dali (inclusive) vira passo. Sem isso, não há sinal
 * suficiente pra separar as duas listas — melhor deixar em branco (baixa
 * confiança) do que adivinhar errado.
 */
function guessSectionsWithoutHeadings(lines: string[]): {
  ingredientLines: string[];
  stepLines: string[];
} {
  const nonEmpty = lines
    .map((line, index) => ({ line, index }))
    .filter((entry) => entry.line.length > 0);
  if (nonEmpty.length <= 1) return { ingredientLines: [], stepLines: [] };

  const body = nonEmpty.slice(1); // drop the title line
  const firstNumbered = body.find((entry) => NUMBERED_LINE.test(entry.line));
  if (!firstNumbered) return { ingredientLines: [], stepLines: [] };

  return {
    ingredientLines: body
      .filter((entry) => entry.index < firstNumbered.index)
      .map((entry) => entry.line),
    stepLines: body
      .filter((entry) => entry.index >= firstNumbered.index)
      .map((entry) => entry.line),
  };
}
