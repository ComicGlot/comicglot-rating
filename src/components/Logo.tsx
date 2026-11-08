// The ComicGlot mark: two overlapping speech balloons, the source line behind and its translation in
// front, with lines of lettering. Colours come from the theme tokens.
export default function Logo({ size = 24, className }: { size?: number; className?: string }) {
  const back = (
    <>
      <ellipse cx="19.5" cy="11" rx="10" ry="7.6" />
      <path d="M24.5 16.2 L29.5 22 L19.8 18.4 Z" />
    </>
  );
  const front = (
    <>
      <ellipse cx="12.5" cy="17.5" rx="10.5" ry="8" />
      <path d="M6.6 23.6 L3 30 L12 25.3 Z" />
    </>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className} style={{ flex: "none" }}>
      <g fill="var(--accent-soft)">{back}</g>
      {/* a ring in the page colour separates the front balloon from the one behind */}
      <g fill="var(--canvas)" stroke="var(--canvas)" strokeWidth="3" strokeLinejoin="round">{front}</g>
      <g fill="var(--accent)">{front}</g>
      <g stroke="var(--on-accent)" strokeWidth="2" strokeLinecap="round">
        <path d="M7.5 15.5 H17.5" />
        <path d="M9.5 19.6 H15.5" />
      </g>
    </svg>
  );
}
