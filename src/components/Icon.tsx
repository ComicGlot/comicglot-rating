// A small set of line icons (16px, 1.6 stroke), drawn here so the app needs no icon package.
const PATHS: Record<string, string> = {
  home: "M3 7.5 8 3l5 4.5V13H9.5V9.5h-3V13H3z",
  users: "M6 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM1.5 13.5c.4-2.3 2.2-3.8 4.5-3.8s4.1 1.5 4.5 3.8M11 3a2.3 2.3 0 0 1 0 4.4M12.5 9.9c1.1.5 1.8 1.5 2 3.1",
  layers: "M8 2 1.8 5.2 8 8.4l6.2-3.2zM1.8 8 8 11.2 14.2 8M1.8 10.8 8 14l6.2-3.2",
  chart: "M2.5 13.5h11M4.5 11V7M8 11V4M11.5 11V8.5",
  download: "M8 2.5v7.5M4.8 7 8 10.2 11.2 7M2.5 13.5h11",
  sparkle: "M8 2.2 9.3 6.7 13.8 8 9.3 9.3 8 13.8 6.7 9.3 2.2 8l4.5-1.3z",
  book: "M2.5 3.2c2-.6 3.9-.4 5.5.8 1.6-1.2 3.5-1.4 5.5-.8v9.6c-2-.6-3.9-.4-5.5.8-1.6-1.2-3.5-1.4-5.5-.8zM8 4v9.6",
  logout: "M6.5 13.5H3.2a.7.7 0 0 1-.7-.7V3.2c0-.4.3-.7.7-.7h3.3M10.5 11 13.5 8l-3-3M13.3 8H6",
  check: "M3.2 8.4 6.4 11.5l6.4-7",
  arrowR: "M3 8h10M9 4l4 4-4 4",
  arrowL: "M13 8H3M7 4 3 8l4 4",
  zoomIn: "M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM13.5 13.5 10.6 10.6M5 7h4M7 5v4",
  zoomOut: "M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM13.5 13.5 10.6 10.6M5 7h4",
  fit: "M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10",
  eye: "M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  sun: "M8 10.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6zM8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9",
  moon: "M13.2 9.6A5.5 5.5 0 0 1 6.4 2.8a5.5 5.5 0 1 0 6.8 6.8z",
  x: "M4 4l8 8M12 4l-8 8",
  copy: "M5.5 5.5V3.2c0-.4.3-.7.7-.7h6.6c.4 0 .7.3.7.7v6.6c0 .4-.3.7-.7.7h-2.3M3.2 5.5h6.6c.4 0 .7.3.7.7v6.6c0 .4-.3.7-.7.7H3.2a.7.7 0 0 1-.7-.7V6.2c0-.4.3-.7.7-.7z",
  flag: "M3.5 14V2.5M3.5 3h8l-1.6 3 1.6 3h-8",
  clock: "M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 4.8V8l2.2 1.4",
  keyboard: "M2 4.5h12v7H2zM4.5 7h.01M7 7h.01M9.5 7h.01M12 7h.01M5 9.5h6",
  play: "M5 3.2v9.6L12.5 8z",
  lock: "M4 7.5h8v6H4zM5.5 7.5V5.3a2.5 2.5 0 0 1 5 0v2.2",
};

export default function Icon({ name, size = 16, className }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}
