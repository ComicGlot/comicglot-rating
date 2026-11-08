export function ago(d: Date | null | undefined, now = Date.now()): string {
  if (!d) return "never";
  const s = Math.round((now - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function minutes(ms: number | null | undefined): string {
  const m = Math.round((ms ?? 0) / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export const pct = (k: number, n: number) => (n ? `${Math.round((100 * k) / n)}%` : "–");
