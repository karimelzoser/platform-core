import { PreviewLoginForm } from './preview-login-form';
export default function PreviewLoginPage() {
  return (
    <main className="workspace">
      <section className="state-panel">
        <p className="eyebrow">DEVELOPMENT PREVIEW</p>
        <h1>Sign in</h1>
        <p>
          This uses the preview Keycloak realm and a real tenant membership. It is unavailable
          outside development.
        </p>
        <PreviewLoginForm />
      </section>
    </main>
  );
}
