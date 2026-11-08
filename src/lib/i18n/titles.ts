import { fmt, type Messages } from "./index";

// Set titles are stored in English ("Set 3", "Practice"); show them in the rater's language.
export function chapterTitle(c: { title: string; practice: boolean }, m: Messages): string {
  if (c.practice) return m.work.practice;
  const n = c.title.match(/^Set (\d+)$/);
  return n ? fmt(m.home.setN, { n: n[1] }) : c.title;
}
