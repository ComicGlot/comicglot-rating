// Minimal OpenRouter client (OpenAI-compatible chat completions).
// Used by the admin panel to produce candidate translations; raters never call it.
type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | Part[] };

export async function chat(model: string, messages: ChatMessage[], temperature = 0.7): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "ComicGlot rating" },
    body: JSON.stringify({ model, messages, temperature, max_tokens: 1024 }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

// The prompt of the ComicGlot pipeline (eval/translation_study/run_conditions.py), so that a model
// reached through OpenRouter gets exactly what the published runs got.
export const CONDITIONS = ["true_class", "no_class", "wrong_class", "no_context"] as const;
export type Condition = (typeof CONDITIONS)[number];

// A mismatched guide per type, pushing tone in a clearly different direction (same table as the pipeline).
const WRONG_CLASS: Record<string, string> = {
  speech_bubble: "scream_bubble", scream_bubble: "think_bubble", think_bubble: "scream_bubble",
  cloud_bubble: "spiked_bubble", spiked_bubble: "cloud_bubble", wiggle_bubble: "scream_bubble",
  hexagon_bubble: "wiggle_bubble", sqare_bubble: "scream_bubble", system_bubble: "wiggle_bubble",
  standalone_text: "system_bubble", background_text: "scream_bubble", title_panel: "think_bubble",
  sfx_sound: "speech_bubble",
};

export type PromptBlock = { text: string; className: string | null };

export function pipelinePrompt(
  cond: Condition,
  block: PromptBlock,
  previous: PromptBlock[],
  guides: Record<string, string>,
  page?: { mime: string; base64: string },
): ChatMessage[] {
  const cls = block.className ?? "default";
  const guideCls = cond === "no_class" ? "default" : cond === "wrong_class" ? WRONG_CLASS[cls] ?? cls : cls;
  const guide = guides[guideCls === "sqare_bubble" ? "square_bubble" : guideCls] ?? guides.default ?? "";
  const lines = cond === "no_context" ? [] : previous.filter((p) => p.text).slice(-3)
    .map((p, i) => `- Prev text ${i + 1}${cond === "no_class" ? "" : ` (${p.className})`}: ${p.text}`);
  const context = lines.length ? `[CONTEXT]: Surrounding texts:\n${lines.join("\n")}\n\n` : "";
  const forType = cond === "no_class" ? "" : ` appropriate for a ${guideCls}`;
  const text =
    "[TASK]: Translate text from ko to en with appropriate style.\n\n" +
    context +
    `[ORIGINAL TEXT]: ${block.text}\n\n` +
    `[STYLE GUIDE]: ${guide}\n\n` +
    `[INSTRUCTIONS]: Translate the original text from ko to en following the style guide${forType}.\n\n` +
    "Analyze the original text, taking into account any context provided and the style guide. " +
    "Think carefully about cultural nuances, idioms, and emotional tone.\n\n" +
    "After your analysis, provide ONLY the translated text with no additional explanation, " +
    "starting with 'TRANSLATED_TEXT:' followed by the translation." +
    (page ? "\n\nThe page the text appears on is attached; use it to judge tone and who is speaking." : "");
  const content: Part[] = [{ type: "text", text }];
  if (page) content.push({ type: "image_url", image_url: { url: `data:${page.mime};base64,${page.base64}` } });
  return [{ role: "user", content: page ? content : text }];
}

export function translationOf(raw: string): string {
  const i = raw.indexOf("TRANSLATED_TEXT:");
  return (i >= 0 ? raw.slice(i + "TRANSLATED_TEXT:".length) : raw).trim();
}
