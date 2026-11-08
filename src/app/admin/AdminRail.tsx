"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";

const LINKS = [
  { section: "Study", items: [["/admin", "Overview", "home"], ["/admin/results", "Results", "chart"]] },
  { section: "Manage", items: [["/admin/raters", "Raters", "users"], ["/admin/studies", "Studies", "layers"], ["/admin/exports", "Exports", "download"]] },
] as const;

export default function AdminRail() {
  const path = usePathname();
  return (
    <nav className="rail" aria-label="Admin">
      {LINKS.map((g) => (
        <div key={g.section} style={{ display: "contents" }}>
          <span className="label">{g.section}</span>
          {g.items.map(([href, label, icon]) => (
            <Link key={href} href={href} className={path === href ? "on" : ""} aria-current={path === href ? "page" : undefined}>
              <Icon name={icon} /> {label}
            </Link>
          ))}
        </div>
      ))}
      <div className="foot small faint">Raters never see conditions, models or other raters&apos; answers.</div>
    </nav>
  );
}
