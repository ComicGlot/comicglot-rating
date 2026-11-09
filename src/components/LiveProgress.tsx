"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

// The progress bar in the top bar; the set runner reports each first save of a frame ("cg:progress").
export default function LiveProgress({ done, all }: { done: number; all: number }) {
  const [n, setN] = useState(done);
  useEffect(() => setN(done), [done]);
  useEffect(() => {
    const on = (e: Event) => setN((x) => Math.min(all, x + (Number((e as CustomEvent).detail) || 0)));
    window.addEventListener("cg:progress", on);
    return () => window.removeEventListener("cg:progress", on);
  }, [all]);
  const pct = Math.round((100 * n) / Math.max(1, all));
  return (
    <Link href="/rate" className="minibar" title={`${n} of ${all} tasks done`} style={{ minWidth: 160 }}>
      <span className="small muted num">{pct}%</span>
      <div className="bar"><i style={{ width: `${pct}%` }} /></div>
    </Link>
  );
}
