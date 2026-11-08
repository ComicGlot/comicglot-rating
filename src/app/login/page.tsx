import LangSwitch from "@/components/LangSwitch";
import Logo from "@/components/Logo";
import { getMessages } from "@/lib/i18n/server";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const { m } = await getMessages();
  return (
    <main className="auth">
      <div style={{ position: "fixed", top: 16, right: 16 }}><LangSwitch /></div>
      <div className="card">
        <Logo size={44} />
        <h1 className="h2">{m.login.title}</h1>
        <p className="muted" style={{ marginBottom: 24 }}>{m.login.subtitle}</p>
        <LoginForm />
      </div>
      <p className="small faint" style={{ position: "fixed", bottom: 16, padding: "0 16px", textAlign: "center" }}>{m.login.privateNote}</p>
    </main>
  );
}
