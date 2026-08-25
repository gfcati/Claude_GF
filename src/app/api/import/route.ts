import { NextResponse } from "next/server";
import { parseRecipeFromUrl } from "@/lib/import/parseRecipe";

export async function POST(request: Request) {
  const { url } = await request.json();

  if (typeof url !== "string" || !URL.canParse(url)) {
    return NextResponse.json({ error: "URL inválida." }, { status: 400 });
  }

  try {
    const result = await parseRecipeFromUrl(url);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao importar a receita." },
      { status: 502 },
    );
  }
}
