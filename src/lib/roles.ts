// Rater roles; safe to import in client components (no Node modules).
export const ROLES = {
  translator: { label: "Translator", steps: ["compare"], note: "Judges the paired English translations" },
  transcriber: { label: "Transcriber", steps: ["transcribe"], note: "Types or checks the Korean" },
  tester: { label: "Tester", steps: [] as string[], note: "Tries every step; left out of the results" },
} as const;
export type RoleName = keyof typeof ROLES;
export const isRole = (r: string): r is RoleName => r in ROLES;
