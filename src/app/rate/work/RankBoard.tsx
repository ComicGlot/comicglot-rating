"use client";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, pointerWithin, rectIntersection, useDraggable, useDroppable,
  useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { useState } from "react";
import Icon from "@/components/Icon";
import { useI18n } from "@/components/I18n";
import { fmt } from "@/lib/i18n";

// Ranking by drag and drop (dnd-kit).
//
// The versions to read sit in one column, full size, in a random order, and stay where they are; a placed version
// shows its rank. Above them, the rater's order runs left (best) to right (worst) in one lane of rank columns. Drop
// zones are explicit, so every drop says what it does: the gap between two ranks ("+") inserts a new rank there,
// the dashed "+ same rank" box under a rank adds the version to it (a tie), the dashed slot after the last rank puts
// it after all others, and the reading list takes it out of the order. A version gets a rank only by being dropped,
// and a text is done when every version has one. Keys work as well: a letter picks a version, a digit places it,
// arrows move it, = ties it with its left neighbour, Backspace takes it out.

export type Card = { letter: string; text: string };
type Target = { kind: "insert"; index: number } | { kind: "join"; index: number } | { kind: "pool" };

// Moves a letter to a target, given the groups as displayed (the letter may still be in them).
export function place(groups: string[][], letter: string, t: Target): string[][] {
  const src = groups.findIndex((g) => g.includes(letter));
  const alone = src >= 0 && groups[src].length === 1;
  const rest = groups.map((g) => g.filter((l) => l !== letter)).filter((g) => g.length);
  if (t.kind === "pool") return rest;
  let i = t.index;
  if (alone && src < i) i -= 1; // the source column disappears and the columns after it move left
  if (t.kind === "join") {
    if (alone && src === t.index) return groups;
    return rest.map((g, k) => (k === i ? [...g, letter] : g));
  }
  if (alone && (src === t.index || src === t.index - 1)) return groups; // dropped next to itself: no change
  return [...rest.slice(0, i), [letter], ...rest.slice(i)];
}

const parseTarget = (id: string | number | undefined): Target | null => {
  const s = String(id ?? "");
  if (s === "pool") return { kind: "pool" };
  const m = /^(gap|join)-(\d+)$/.exec(s);
  return m ? { kind: m[1] === "gap" ? "insert" : "join", index: Number(m[2]) } : null;
};

// Prefer the zone under the pointer; fall back to overlap for keyboard and touch edges.
const collide: CollisionDetection = (args) => {
  const hit = pointerWithin(args);
  return hit.length ? hit : rectIntersection(args);
};

function Zone({ id, className, children, label }: { id: string; className: string; children?: React.ReactNode; label?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={`${className}${isOver ? " over" : ""}`} aria-label={label}>{children}</div>;
}

function DragCard({ id, letter, children, className, onKeyDown, title, ariaLabel }: {
  id: string; letter: string; children: React.ReactNode; className: string; onKeyDown: (e: React.KeyboardEvent) => void; title?: string; ariaLabel?: string;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id, data: { letter } });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-card={letter}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={`${className}${isDragging ? " lifted" : ""}`}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}

export default function RankBoard({ cards, groups, onChange }: {
  cards: Card[];
  groups: string[][];
  onChange: (next: string[][], move: string) => void;
}) {
  const { m } = useI18n();
  const [active, setActive] = useState<string | null>(null);
  const [over, setOver] = useState<Target | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const text = new Map(cards.map((c) => [c.letter, c.text]));
  const placed = new Set(groups.flat());
  const left = cards.filter((c) => !placed.has(c.letter)).length;
  const rankOf: Record<string, number> = {};
  {
    let n = 1;
    for (const g of groups) { for (const l of g) rankOf[l] = n; n += g.length; }
  }

  const commit = (letter: string, t: Target | null, how: string) => {
    if (!t) return;
    const next = place(groups, letter, t);
    if (JSON.stringify(next) !== JSON.stringify(groups)) onChange(next, `${letter}:${how}`);
  };
  const onStart = (e: DragStartEvent) => setActive(String(e.active.data.current?.letter ?? ""));
  const onOver = (e: DragOverEvent) => setOver(parseTarget(e.over?.id));
  const onEnd = (e: DragEndEvent) => {
    const letter = String(e.active.data.current?.letter ?? "");
    const t = parseTarget(e.over?.id);
    setActive(null);
    setOver(null);
    if (t?.kind === "pool" && !placed.has(letter)) return; // from the list back onto the list: nothing to do
    commit(letter, t, t ? `${t.kind}${"index" in t ? t.index : ""}` : "none");
  };

  // Keyboard on a focused version.
  const onKey = (e: React.KeyboardEvent, letter: string) => {
    const gi = groups.findIndex((g) => g.includes(letter));
    // The order without this version, and the column it would come back in front of.
    const rest = groups.map((g) => g.filter((l) => l !== letter)).filter((g) => g.length);
    const restIndexOf = (k: number) => groups.slice(0, k).filter((g) => g.some((l) => l !== letter)).length;
    const at = (i: number) => [...rest.slice(0, i), [letter], ...rest.slice(i)];
    let next: string[][] | null = null;
    if (/^[1-9]$/.test(e.key)) next = at(Math.min(Number(e.key) - 1, rest.length)); // its own rank n
    else if (gi >= 0 && e.key === "ArrowLeft") next = at(Math.max(0, restIndexOf(gi) - (groups[gi].length === 1 ? 1 : 0)));
    else if (gi >= 0 && e.key === "ArrowRight") next = at(Math.min(rest.length, restIndexOf(gi) + 1));
    else if (gi > 0 && e.key === "=") next = place(groups, letter, { kind: "join", index: gi - 1 });
    else if (gi >= 0 && (e.key === "Backspace" || e.key === "Delete")) next = rest;
    else return;
    e.preventDefault();
    e.stopPropagation();
    if (JSON.stringify(next) !== JSON.stringify(groups)) onChange(next, `${letter}:key${e.key}`);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`.pcard[data-card="${letter}"]`)?.focus());
  };

  const dragging = active !== null;
  const note = (t: Target | null) =>
    !t ? m.ranking.dropNowhere
      : t.kind === "pool" ? (placed.has(active ?? "") ? m.ranking.willOut : m.ranking.dropNowhere)
      : t.kind === "join" ? fmt(m.ranking.willTie, { n: rankOf[groups[t.index][0]] })
      : fmt(m.ranking.willPlace, { n: groups.slice(0, t.index).flat().filter((l) => l !== active).length + 1 });

  return (
    <DndContext sensors={sensors} collisionDetection={collide} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd} onDragCancel={() => { setActive(null); setOver(null); }}>
      <div className={`rankboard${dragging ? " dragging" : ""}`}>
        {/* ---- the order: rank columns, best on the left, with explicit drop zones ---- */}
        <div className="lanewrap">
          <div className="lanehead">
            <span className="label">{m.ranking.lane}</span>
            <span className="lanescale"><b>{m.ranking.best}</b><span className="arrow" /><b>{m.ranking.worst}</b></span>
          </div>
          <div className="lane" role="list" aria-label={m.ranking.lane}>
            {groups.map((g, i) => (
              <div key={g.join("")} className="lanecell">
                <Zone id={`gap-${i}`} className="gap" label={fmt(m.ranking.willPlace, { n: i + 1 })}><span className="plus">+</span></Zone>
                <div className="col" role="listitem">
                  <div className="colhead">
                    <span className="rk num">{rankOf[g[0]]}</span>
                    {g.length > 1 && <span className="tiepill">{fmt(m.ranking.tied, { n: g.length })}</span>}
                  </div>
                  <Zone id={`join-${i}`} className="colbody">
                    {g.map((l) => (
                      <DragCard key={l} id={`lane:${l}`} letter={l} className="lcard" onKeyDown={(e) => onKey(e, l)} title={text.get(l)} ariaLabel={fmt(m.ranking.cardAt, { l, n: rankOf[l] })}>
                        <span className="ltr">{l}</span>
                        <span className="lt">{text.get(l)}</span>
                        <button type="button" className="out" onPointerDown={(e) => e.stopPropagation()} onClick={() => commit(l, { kind: "pool" }, "out")} aria-label={m.ranking.takeOut} title={m.ranking.takeOut}>
                          <Icon name="x" size={12} />
                        </button>
                      </DragCard>
                    ))}
                    <div className="tiezone"><span>+ {m.ranking.sameRank}</span></div>
                  </Zone>
                </div>
              </div>
            ))}
            {left > 0 ? (
              <div className="lanecell rest">
                <Zone id={`gap-${groups.length}`} className="col slot">
                  <span className="rk num">{groups.flat().length + 1}</span>
                  <span className="hint">{groups.length ? m.ranking.nextRank : m.ranking.dropHere}</span>
                </Zone>
                {Array.from({ length: left - 1 }, (_, k) => (
                  <div key={k} className="col ghostslot" aria-hidden="true"><span className="rk num">{groups.flat().length + 2 + k}</span></div>
                ))}
              </div>
            ) : (
              <Zone id={`gap-${groups.length}`} className="gap end"><span className="plus">+</span></Zone>
            )}
          </div>
        </div>

        {/* ---- every version, full size, one column, random order; placed ones show their rank ---- */}
        <div className="poolhead">
          <span className="label">{left ? fmt(m.ranking.poolCount, { n: left }) : m.ranking.allPlaced}</span>
          <span className="small muted">{m.ranking.randomOrder}</span>
        </div>
        <Zone id="pool" className="pool">
          {cards.map((c) => {
            const r = rankOf[c.letter];
            const tied = r !== undefined && groups.find((g) => g.includes(c.letter))!.length > 1;
            return (
              <DragCard key={c.letter} id={`pool:${c.letter}`} letter={c.letter} className={`pcard${r ? " placed" : ""}`} onKeyDown={(e) => onKey(e, c.letter)}>
                <span className="grip" aria-hidden="true"><i /><i /></span>
                <span className="ltr">{c.letter}</span>
                <span className="pt">{c.text}</span>
                {r ? <span className="rbadge num" title={fmt(m.ranking.cardAt, { l: c.letter, n: r })}>{tied ? "=" : ""}{r}</span> : <span className="rbadge open" aria-hidden="true" />}
              </DragCard>
            );
          })}
        </Zone>
      </div>

      <DragOverlay modifiers={[snapCenterToCursor]} dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" }}>
        {active && (
          <div className="dragcard">
            <span className="ltr">{active}</span>
            <span className="pt">{text.get(active)}</span>
            <span className={`dropnote${over && !(over.kind === "pool" && !placed.has(active)) ? "" : " none"}`}>{note(over)}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
