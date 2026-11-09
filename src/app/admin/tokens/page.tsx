import ConfirmButton from "@/components/ConfirmButton";
import { ROLES, isRole } from "@/lib/access";
import { db } from "@/lib/db";
import { ago } from "@/lib/format";
import { deleteToken, toggleToken } from "../actions";
import { CreateTokenForm, InviteButtons } from "../RaterForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Access keys" };

export default async function Tokens() {
  const [tokens, studies] = await Promise.all([
    db.accessToken.findMany({ orderBy: { createdAt: "desc" }, include: { study: { select: { name: true } }, _count: { select: { raters: true } } } }),
    db.study.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
  ]);
  const now = new Date();
  return (
    <>
      <div className="admhead">
        <div>
          <span className="label">Manage</span>
          <h1 className="h1" style={{ marginTop: 4 }}>Access keys</h1>
          <p className="muted" style={{ maxWidth: 640 }}>
            Hand a key to a person; they type it on the sign-in page and start. A one-person key stays that person&apos;s key, so they can come back with it on any device.
            A shared key gives each person who uses it a personal key of their own, shown on their home page. Testers are left out of the results.
          </p>
        </div>
      </div>
      <CreateTokenForm studies={studies} />
      <div className="section">
        <span className="label">{tokens.length} key{tokens.length === 1 ? "" : "s"}</span>
        {tokens.length === 0 && <div className="empty">No key yet.</div>}
        <div className="stack" style={{ gap: 8 }}>
          {tokens.map((t) => {
            const expired = !!t.expiresAt && t.expiresAt < now;
            const used = t.maxUses != null && t.uses >= t.maxUses;
            const live = t.active && !expired && !used;
            return (
              <div key={t.id} className="card tight" style={{ opacity: live ? 1 : 0.65 }}>
                <div className="row between" style={{ alignItems: "flex-start", gap: 12 }}>
                  <div>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="code" style={{ fontSize: 15 }}>{t.token}</span>
                      <span className="pill violet">{isRole(t.role) ? ROLES[t.role].label : t.role}</span>
                      {live ? <span className="pill ok">open</span> : <span className="pill warn">{!t.active ? "paused" : expired ? "expired" : "used up"}</span>}
                    </div>
                    <div className="small muted" style={{ marginTop: 6 }}>
                      {t.label || "no label"} · {t.maxUses == null ? "anyone" : t.maxUses === 1 ? "one person" : `up to ${t.maxUses}`} · used {t.uses}× · {t._count.raters} rater{t._count.raters === 1 ? "" : "s"} ·{" "}
                      {t.study?.name ?? "every open study"} · {t.expiresAt ? (expired ? "ended" : `until ${t.expiresAt.toISOString().slice(0, 10)}`) : "no end"} · made {ago(t.createdAt)}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                    <InviteButtons token={t.token} />
                    <form action={toggleToken}><input type="hidden" name="tokenId" value={t.id} /><button className="btn sm">{t.active ? "Pause" : "Resume"}</button></form>
                    <form action={deleteToken}><input type="hidden" name="tokenId" value={t.id} /><ConfirmButton confirm="Delete key?">Delete</ConfirmButton></form>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
