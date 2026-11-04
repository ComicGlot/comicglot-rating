// The tasks a rater does on every page, in this order.
export const STEP_ORDER = ["types", "transcribe", "compare", "review"] as const;
export type Step = (typeof STEP_ORDER)[number];

export const STEP_LABEL: Record<Step, string> = {
  types: "Text types",
  transcribe: "Transcription",
  compare: "Translations",
  review: "Check the page",
};

export const STEP_HELP: Record<Step, string> = {
  types: "For each numbered box, choose the kind of balloon, box or lettering the text is drawn in. Use the labelling rules if unsure.",
  transcribe: "Type the Korean exactly as it is drawn in each numbered box, including punctuation. Mark a box unreadable if you cannot read it.",
  compare: "For each block, choose the better English translation for the text as it is drawn on the page, or a tie. Mark tone that is added or overdone.",
  review: "Check what you entered on this page. Go back to a step to change it, or confirm the page.",
};

export const TYPES = [
  ["speech_bubble", "Speech (oval, tail to the speaker)"],
  ["think_bubble", "Thought (tail of shrinking circles)"],
  ["cloud_bubble", "Cloud (half circles bulging outwards)"],
  ["wiggle_bubble", "Wiggle (outline waving in and out)"],
  ["scream_bubble", "Scream (burst of large pointed lobes)"],
  ["spiked_bubble", "Spiked (many thin needles)"],
  ["hexagon_bubble", "Hexagon (straight-edged polygon)"],
  ["sqare_bubble", "Narration box (plain rectangle)"],
  ["system_bubble", "System window (game-style notification)"],
  ["standalone_text", "Free text (no container)"],
  ["background_text", "Background text (part of the scene)"],
  ["title_panel", "Title"],
  ["sfx_sound", "Sound effect"],
  ["not_text", "Not text / wrong box"],
] as const;

export const TONE = ["fine", "added", "overdone"] as const;

// Steps of a study that this rater does; review is kept whenever another step is.
export function effectiveSteps(studySteps: string[], raterSteps: string[]): Step[] {
  const allowed = new Set(raterSteps.length ? [...raterSteps, "review"] : STEP_ORDER);
  const s = STEP_ORDER.filter((x) => studySteps.includes(x) && allowed.has(x));
  return s.some((x) => x !== "review") ? s : [];
}
