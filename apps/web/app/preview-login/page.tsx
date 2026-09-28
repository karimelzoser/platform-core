interface PreviewLoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function PreviewLoginPage({ searchParams }: PreviewLoginPageProps) {
  const { error } = await searchParams;
  const errorMessage = displayError(error);
  return (
    <main className="workspace">
      <section className="state-panel">
        <p className="eyebrow">DEVELOPMENT PREVIEW</p>
        <h1>Sign in</h1>
        <p>
          This uses the preview Keycloak realm and a real tenant membership. It is unavailable
          outside development.
        </p>
        <form action="/preview-login/session" className="customer-form" method="post">
          <label>
            Username
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {errorMessage ? (
            <p className="form-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
          <button className="action" type="submit">
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}

function displayError(error: string | undefined): string | undefined {
  if (error === 'invalid_credentials') return 'Invalid development credentials.';
  if (error === 'keycloak_unavailable') return 'Development Keycloak is unavailable.';
  if (error === 'misconfigured') return 'Preview authentication is not configured.';
  return undefined;
}
