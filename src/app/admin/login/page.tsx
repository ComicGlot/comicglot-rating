import Logo from "@/components/Logo";
import AdminLoginForm from "./AdminLoginForm";

export const metadata = { title: "Admin sign-in" };

export default function AdminLoginPage() {
  return (
    <main className="auth">
      <div className="card">
        <Logo size={44} />
        <h1 className="h2">Admin</h1>
        <p className="muted" style={{ marginBottom: 24 }}>The name and password set in the server environment.</p>
        <AdminLoginForm />
      </div>
    </main>
  );
}
