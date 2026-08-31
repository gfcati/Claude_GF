import { NextResponse } from "next/server";
import { parseRecipeFromText } from "@/lib/import/parseRecipeText";

export async function POST(request: Request) {
  const { text } = await request.json();

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Cole o texto da receita." }, { status: 400 });
  }

  const result = parseRecipeFromText(text);
  return NextResponse.json(result);
}
