import Link from "next/link";
import Icon from "./Icon";
import ThemeToggle from "./ThemeToggle";

// The 56px bar on every signed-in page: brand at left, where you are in the middle, account at right.
export default function TopNav({
  home,
  user,
  crumbs = [],
  children,
  right,
}: {
  home: string;
  user?: string;
  crumbs?: (string | { label: string; href?: string; strong?: boolean })[];
  children?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <header className="topnav">
      <Link href={home} className="brand" aria-label="ComicGlot rating, home">
        <span className="glyph" />
        <span>ComicGlot <span className="sub">rating</span></span>
      </Link>
      <div className="navmid">
        {crumbs.length > 0 && (
          <nav className="crumbs" aria-label="Where you are">
            {crumbs.map((c, i) => {
              const x = typeof c === "string" ? { label: c } : c;
              const body = x.strong || i === crumbs.length - 1 ? <b>{x.label}</b> : <span>{x.label}</span>;
              return (
                <span key={i} style={{ display: "contents" }}>
                  <span className="sep">/</span>
                  {x.href ? <Link href={x.href}>{body}</Link> : body}
                </span>
              );
            })}
          </nav>
        )}
        {children}
      </div>
      <div className="navright">
        {right}
        <ThemeToggle />
        {user && (
          <>
            <span className="avatar" title={user}>{user.slice(0, 1)}</span>
            <form action="/api/logout" method="post">
              <button className="btn ghost icon" title="Sign out" aria-label="Sign out"><Icon name="logout" /></button>
            </form>
          </>
        )}
      </div>
    </header>
  );
}
