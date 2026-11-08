import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="auth">
      <div className="card">
        <span className="glyph lg" />
        <h1 className="h2">ComicGlot rating</h1>
        <p className="muted" style={{ marginBottom: 24 }}>Sign in with the name and access code you were given.</p>
        <LoginForm />
      </div>
      <p className="small faint" style={{ position: "fixed", bottom: 16 }}>Private study material. Please do not share the pages you see here.</p>
    </main>
  );
}
