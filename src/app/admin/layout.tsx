import TopNav from "@/components/TopNav";
import { requireAdmin } from "@/lib/auth";
import AdminRail from "./AdminRail";

export const metadata = { title: { default: "Admin", template: "%s · Admin · ComicGlot rating" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await requireAdmin();
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
