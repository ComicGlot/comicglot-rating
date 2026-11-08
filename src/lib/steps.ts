// The tasks a rater does on every frame, in this order.
export const STEP_ORDER = ["types", "transcribe", "compare", "review"] as const;
export type Step = (typeof STEP_ORDER)[number];

export const STEP_LABEL: Record<Step, string> = {
  types: "Text types",
  transcribe: "Transcription",
  compare: "Translations",
  review: "Check the frame",
};

export const STEP_SHORT: Record<Step, string> = {
  types: "Types",
  transcribe: "Transcribe",
  compare: "Translate",
  review: "Check",
};

export const STEP_HELP: Record<Step, string> = {
  types: "Choose the kind of balloon, box or lettering each numbered text is drawn in.",
  transcribe: "Type the Korean exactly as it is drawn in each numbered box, with its punctuation. Mark a box unreadable if you cannot read it.",
  compare: "For each text, choose the English version that fits the line as it is drawn on the page, or call it a tie. Mark tone that is added or overdone.",
  review: "Look over what you entered on this frame. Go back to a step to change it, or confirm the frame.",
};

// Longer instructions for the guide panel and the welcome page.
export const STEP_GUIDE: Record<Exclude<Step, "review">, string[]> = {
  types: [
    "Look at the shape that holds the text, not at what the text says.",
    "If two types seem possible, choose the one the outline shows most clearly and add a note.",
    "Choose “Not text” when the box holds no lettering or cuts through the middle of a line.",
  ],
  transcribe: [
    "Type every character you see, in reading order, including …, !, ? and ~.",
    "Leave out line breaks; a single space between lines is fine.",
    "Sound effects count: type the syllables as drawn, even if they are not real words.",
    "If part of the text is hidden or cut off, type what you can read and add [?] for the rest.",
    "Mark the box unreadable only if you cannot read most of it.",
  ],
  compare: [
    "Judge each version against the Korean and against how the line is drawn: the balloon, the lettering and the scene.",
    "A version is better if a reader of an English comic would get the same meaning and the same tone from it.",
    "Adding tone that is not on the page is as wrong as losing it, e.g. a calm line turned into a shout.",
    "Choose a tie when both are equally good or equally bad.",
    "If the Korean source shown is itself wrong (misread), still judge the versions, and tick “Korean looks wrong”.",
  ],
};

// The detector's 13 types (class names as the detector writes them) plus "not text".
export const TYPES = [
  ["speech_bubble", "Speech", "Oval or rounded balloon, usually with a tail to the speaker"],
  ["think_bubble", "Thought", "Balloon with a tail of shrinking circles"],
  ["cloud_bubble", "Cloud", "Outline of half circles bulging outwards"],
  ["wiggle_bubble", "Wiggle", "Outline that waves in and out, often trembling"],
  ["scream_bubble", "Scream", "Burst of a few large pointed lobes"],
  ["spiked_bubble", "Spiked", "Many thin needles around the edge"],
  ["hexagon_bubble", "Hexagon", "Straight-edged polygon"],
  ["sqare_bubble", "Narration box", "Plain rectangle, no tail"],
  ["system_bubble", "System window", "Game-style notification or interface panel"],
  ["standalone_text", "Free text", "Lettering with no container"],
  ["background_text", "Background text", "Part of the scene: signs, screens, books"],
  ["title_panel", "Title", "Series or chapter title lettering"],
  ["sfx_sound", "Sound effect", "Drawn sound word"],
  ["not_text", "Not text", "No lettering, or a wrong box"],
] as const;

export const TYPE_NAME: Record<string, string> = Object.fromEntries(TYPES.map(([v, n]) => [v, n]));

// Families as in ComicGlot research/common.py (used for the study table).
export const FAMILY_OF: Record<string, Family> = {
  speech_bubble: "balloon", think_bubble: "balloon", cloud_bubble: "balloon", wiggle_bubble: "balloon",
  scream_bubble: "balloon", hexagon_bubble: "balloon", spiked_bubble: "balloon",
  sqare_bubble: "box", standalone_text: "box", background_text: "box", title_panel: "box", system_bubble: "box",
  sfx_sound: "sfx",
};
export type Family = "balloon" | "box" | "sfx";
export const FAMILY_LABEL: Record<Family, string> = { balloon: "Outlined balloons", box: "Boxes and free text", sfx: "Sound effects" };

// The four groups of the recognition table (tab:cer).
export type OcrGroup = "balloon" | "boxsys" | "free" | "sfx";
export const OCR_GROUP_OF: Record<string, OcrGroup> = {
  speech_bubble: "balloon", think_bubble: "balloon", cloud_bubble: "balloon", wiggle_bubble: "balloon",
  scream_bubble: "balloon", hexagon_bubble: "balloon", spiked_bubble: "balloon",
  sqare_bubble: "boxsys", system_bubble: "boxsys",
  standalone_text: "free", background_text: "free", title_panel: "free",
  sfx_sound: "sfx",
};
export const OCR_GROUP_LABEL: Record<OcrGroup, string> = { balloon: "Balloons", boxsys: "Boxes and system", free: "Free text, titles", sfx: "Sound effects" };

export const TONE = ["fine", "added", "overdone"] as const;
export const TONE_LABEL: Record<(typeof TONE)[number], string> = { fine: "Fits", added: "Adds tone", overdone: "Overdone" };

// Steps of a study that this rater does; review is kept whenever another step is.
export function effectiveSteps(studySteps: string[], raterSteps: string[]): Step[] {
  const allowed = new Set(raterSteps.length ? [...raterSteps, "review"] : STEP_ORDER);
  const s = STEP_ORDER.filter((x) => studySteps.includes(x) && allowed.has(x));
  return s.some((x) => x !== "review") ? s : [];
}

// The comparison group of an attention check: two identical texts, the expected answer is a tie.
export const ATTENTION_MODEL = "attention";

// "true_class+page@openai/gpt-x" -> "true_class"
export function baseCondition(condition: string): string {
  return condition.split("@")[0].replace(/\+page$/, "");
}
