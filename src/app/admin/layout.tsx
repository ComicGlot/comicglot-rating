import TopNav from "@/components/TopNav";
import { getSession } from "@/lib/auth";
import AdminRail from "./AdminRail";

export const metadata = { title: { default: "Admin", template: "%s · Admin · ComicGlot rating" } };

// The middleware keeps everyone but the admin out of /admin; the only page reached without the admin session is /admin/login.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (s?.role !== "admin") return <>{children}</>;
  return (
    <>
      <TopNav home="/admin" user={s.username} crumbs={["Admin"]} />
      <div className="adm">
        <AdminRail />
        <main className="admmain">{children}</main>
      </div>
    </>
  );
}
