"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { useI18n } from "@/components/I18n";
import { fmt } from "@/lib/i18n";

// Ranking by drag and drop.
//
// The versions to read sit in one column, full size, in a random order (the reading list). Above it, the rater's
// order runs left (best) to right (worst) in one lane, with one numbered slot per version still to place. A version
// is ranked only by moving it into the lane, so no version gets a rank by default; the text is done when the reading
// list is empty. Dropping between two cards inserts, dropping onto a card gives both the same rank (they stack in one
// slot), and dropping back on the list takes a version out. Every move can be made from the keyboard too.

export type Card = { letter: string; text: string };
type Target = { kind: "insert"; index: number } | { kind: "join"; index: number } | { kind: "pool" };
type Drag = { letter: string; fromLane: boolean; x: number; y: number; dx: number; dy: number; w: number; target: Target | null };

// Moves a letter to a target, given the groups as displayed (the letter may still be in them).
export function place(groups: string[][], letter: string, t: Target): string[][] {
  const src = groups.findIndex((g) => g.includes(letter));
  const alone = src >= 0 && groups[src].length === 1;
  const rest = groups.map((g) => g.filter((l) => l !== letter)).filter((g) => g.length);
  if (t.kind === "pool") return rest;
  let i = t.index;
  if (alone && src < i) i -= 1; // the source column disappears and the columns after it move left
  if (t.kind === "join") {
    if (alone && src === t.index) return groups; // onto itself
    return rest.map((g, k) => (k === i ? [...g, letter] : g));
  }
  return [...rest.slice(0, i), [letter], ...rest.slice(i)];
}

export default function RankBoard({ cards, groups, onChange, scroller }: {
  cards: Card[];
  groups: string[][];
  onChange: (next: string[][], move: string) => void;
  scroller: () => HTMLElement | null;
}) {
  const { m } = useI18n();
  const lane = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const pending = useRef<{ letter: string; fromLane: boolean; x: number; y: number; el: HTMLElement; id: number; touch: boolean } | null>(null);
  const speed = useRef(0);
  const start = useRef({ x: 0, y: 0 });

  const text = new Map(cards.map((c) => [c.letter, c.text]));
  const placed = new Set(groups.flat());
  const pool = cards.filter((c) => !placed.has(c.letter));
  const rankOf: Record<string, number> = {};
  {
    let n = 1;
    for (const g of groups) { for (const l of g) rankOf[l] = n; n += g.length; }
  }

  // Where would the card land if dropped at (x, y)?
  const targetAt = useCallback((x: number, y: number, fromLane: boolean): Target | null => {
    const L = lane.current?.getBoundingClientRect();
    if (L && y >= L.top - 28 && y <= L.bottom + 28 && x >= L.left - 20 && x <= L.right + 20) {
      const cols = [...(lane.current?.querySelectorAll<HTMLElement>("[data-col]") ?? [])].map((el) => el.getBoundingClientRect());
      for (const [i, r] of cols.entries()) {
        const edge = Math.min(28, r.width * 0.22);
        if (x > r.left + edge && x < r.right - edge) return { kind: "join", index: i };
      }
      return { kind: "insert", index: cols.filter((r) => r.left + r.width / 2 < x).length };
    }
    const P = list.current?.getBoundingClientRect();
    if (fromLane && P && y >= P.top - 10 && y <= P.bottom + 40 && x >= P.left && x <= P.right) return { kind: "pool" };
    return null;
  }, []);

  // Scroll the task panel while a card is held near its top or bottom edge.
  useEffect(() => {
    if (!drag) return;
    let raf = 0;
    const tick = () => {
      const sc = scroller();
      if (sc && speed.current) sc.scrollTop += speed.current;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drag, scroller]);

  const begin = (p: NonNullable<typeof pending.current>, x: number, y: number) => {
    const r = p.el.getBoundingClientRect();
    setDrag({ letter: p.letter, fromLane: p.fromLane, x, y, dx: x - r.left, dy: y - r.top, w: r.width, target: null });
    try { p.el.setPointerCapture(p.id); } catch {}
    navigator.vibrate?.(8);
  };

  const onDown = (e: React.PointerEvent<HTMLElement>, letter: string, fromLane: boolean) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    // On a touch screen a finger on the text of a version scrolls the page; a drag starts from its grip, and from any
    // card already in the lane (the lane does not scroll vertically).
    const touch = e.pointerType !== "mouse";
    if (touch && !fromLane && !(e.target as HTMLElement).closest(".grip")) return;
    // No text selection while dragging; keep the keyboard on this version.
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
    pending.current = { letter, fromLane, x: e.clientX, y: e.clientY, el: e.currentTarget, id: e.pointerId, touch: false };
    start.current = { x: e.clientX, y: e.clientY };
  };

  const onMove = (e: React.PointerEvent) => {
    const p = pending.current;
    const d = dragRef.current;
    if (!d && p) {
      const far = Math.hypot(e.clientX - p.x, e.clientY - p.y) > 5;
      if (far) begin(p, e.clientX, e.clientY);
      return;
    }
    if (!d) return;
    e.preventDefault();
    const sc = scroller()?.getBoundingClientRect();
    // Scroll near the panel's edges, but only once the card has really moved, so picking up a version near the
    // bottom does not start the page scrolling.
    const moved = Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 40;
    speed.current = sc && moved ? (e.clientY < sc.top + 60 ? -12 : e.clientY > sc.bottom - 60 ? 12 : 0) : 0;
    setDrag({ ...d, x: e.clientX, y: e.clientY, target: targetAt(e.clientX, e.clientY, d.fromLane) });
  };

  const onUp = () => {
    pending.current = null;
    speed.current = 0;
    const d = dragRef.current;
    setDrag(null);
    if (d?.target) {
      const next = place(groups, d.letter, d.target);
      if (JSON.stringify(next) !== JSON.stringify(groups)) onChange(next, `${d.letter}:${d.target.kind}${"index" in d.target ? d.target.index : ""}`);
    }
  };

  // Keyboard: digits place at that rank, arrows move, = joins the version on the left, Backspace takes out.
  const onKey = (e: React.KeyboardEvent, letter: string) => {
    const gi = groups.findIndex((g) => g.includes(letter));
    let next: string[][] | null = null;
    if (/^[1-9]$/.test(e.key)) {
      const want = Number(e.key) - 1;
      const rest = groups.map((g) => g.filter((l) => l !== letter)).filter((g) => g.length);
      next = [...rest.slice(0, Math.min(want, rest.length)), [letter], ...rest.slice(Math.min(want, rest.length))];
    } else if (gi >= 0 && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      next = place(groups, letter, { kind: "insert", index: e.key === "ArrowLeft" ? Math.max(0, gi - (groups[gi].length > 1 ? 0 : 1)) : gi + (groups[gi].length > 1 ? 1 : 2) });
    } else if (gi > 0 && e.key === "=") {
      next = place(groups, letter, { kind: "join", index: gi - 1 });
    } else if (gi >= 0 && (e.key === "Backspace" || e.key === "Delete")) {
      next = place(groups, letter, { kind: "pool" });
    } else return;
    e.preventDefault();
    e.stopPropagation();
    if (next && JSON.stringify(next) !== JSON.stringify(groups)) {
      onChange(next, `${letter}:key${e.key}`);
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-card="${letter}"]`)?.focus());
    }
  };

  const t = drag?.target;
  const cardProps = (letter: string, fromLane: boolean) => ({
    "data-card": letter,
    tabIndex: 0,
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => onDown(e, letter, fromLane),
    onPointerMove: onMove,
    onPointerUp: onUp,
    onPointerCancel: onUp,
    onKeyDown: (e: React.KeyboardEvent) => onKey(e, letter),
    "aria-roledescription": m.ranking.draggable,
  });

  return (
    <div className={`rankboard${drag ? " dragging" : ""}`}>
      <p className="small muted rankhelp">{m.ranking.how}</p>
      <div className="lanewrap">
      {/* ---- the rater's order: one lane, best on the left ---- */}
      <div className="lanehead">
        <span className="label">{m.ranking.lane}</span>
        <span className="lanescale"><b>{m.ranking.best}</b><span className="arrow" /> <b>{m.ranking.worst}</b></span>
      </div>
      <div className="lane" ref={lane} role="list" aria-label={m.ranking.lane}>
        {groups.map((g, i) => (
          <div
            key={g.join("")}
            data-col={i}
            role="listitem"
            className={`col${t?.kind === "join" && t.index === i ? " join" : ""}${t?.kind === "insert" && t.index === i ? " before" : ""}${t?.kind === "insert" && t.index === groups.length && i === groups.length - 1 ? " after" : ""}`}
          >
            <span className="rk num">{rankOf[g[0]]}{g.length > 1 && <small>=</small>}</span>
            {g.map((l) => (
              <div key={l} className={`lcard${drag?.letter === l ? " ghost" : ""}`} {...cardProps(l, true)} title={text.get(l)} aria-label={fmt(m.ranking.cardAt, { l, n: rankOf[l] })}>
                <span className="ltr">{l}</span>
                <span className="lt">{text.get(l)}</span>
                <button type="button" className="out" onClick={() => onChange(place(groups, l, { kind: "pool" }), `${l}:out`)} aria-label={m.ranking.takeOut} title={m.ranking.takeOut}>
                  <Icon name="x" size={12} />
                </button>
              </div>
            ))}
          </div>
        ))}
        {pool.map((c, k) => (
          <div key={`slot${k}`} className={`col empty${t?.kind === "insert" && t.index === groups.length && k === 0 ? " before" : ""}`} aria-hidden="true">
            <span className="rk num">{groups.flat().length + k + 1}</span>
            <span className="hint">{k === 0 ? m.ranking.dropHere : ""}</span>
          </div>
        ))}
      </div>
      </div>

      {/* ---- every version, full size, in one column, in random order. The list never reorders: a placed version
           stays where it is and shows its rank, so the rater can reread every version at any time. ---- */}
      <div className="poolhead">
        <span className="label">{pool.length ? fmt(m.ranking.poolCount, { n: pool.length }) : m.ranking.allPlaced}</span>
        <span className="small muted">{m.ranking.randomOrder}</span>
      </div>
      <div className="pool" ref={list} role="list" aria-label={m.ranking.poolLabel}>
        {cards.map((c) => {
          const r = rankOf[c.letter];
          const tied = r !== undefined && groups.find((g) => g.includes(c.letter))!.length > 1;
          return (
            <div key={c.letter} role="listitem" className={`pcard${r ? " placed" : ""}${drag?.letter === c.letter ? " ghost" : ""}`} {...cardProps(c.letter, false)}>
              <span className="grip" aria-hidden="true"><i /><i /><i /></span>
              <span className="ltr">{c.letter}</span>
              <span className="pt">{c.text}</span>
              {r ? <span className="rbadge num" title={fmt(m.ranking.cardAt, { l: c.letter, n: r })}>{tied ? "=" : ""}{r}</span> : <span className="rbadge open" aria-hidden="true" />}
            </div>
          );
        })}
      </div>

      {/* the card under the pointer */}
      {drag && (
        <div className="dragcard" style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: Math.min(drag.w, 420) }} aria-hidden="true">
          <span className="ltr">{drag.letter}</span>
          <span className="pt">{text.get(drag.letter)}</span>
          {t && <span className="dropnote">{t.kind === "join" ? fmt(m.ranking.willTie, { n: rankOf[groups[t.index][0]] }) : t.kind === "pool" ? m.ranking.willOut : fmt(m.ranking.willPlace, { n: groups.slice(0, t.index).flat().filter((l) => l !== drag.letter).length + 1 })}</span>}
        </div>
      )}
    </div>
  );
}
