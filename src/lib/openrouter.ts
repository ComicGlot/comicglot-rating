// Minimal OpenRouter client (OpenAI-compatible chat completions).
// Used by the admin panel to produce candidate translations; raters never call it.
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function chat(model: string, messages: ChatMessage[], temperature = 0.7): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Title": "ComicGlot rating",
    },
    body: JSON.stringify({ model, messages, temperature }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

// Two conditions of the study: with the type's style guide, and with no type.
export function translationPrompt(source: string, context: string[], guide?: string): ChatMessage[] {
  const sys =
    "You translate Korean webtoon text into natural English for a published comic. " +
    "Return only the translation." +
    (guide ? `\nStyle guide for this text block: ${guide}` : "");
  const ctx = context.length ? `Previous lines in the scene:\n${context.join("\n")}\n\n` : "";
  return [
    { role: "system", content: sys },
    { role: "user", content: `${ctx}Translate:\n${source}` },
  ];
}
