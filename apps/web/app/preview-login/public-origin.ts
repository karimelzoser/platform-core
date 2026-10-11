interface PreviewOriginEnvironment {
  APP_PUBLIC_URL?: string | undefined;
  RAILWAY_PUBLIC_DOMAIN?: string | undefined;
  CODESPACE_NAME?: string | undefined;
  GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN?: string | undefined;
}

/** Public redirects use deployment configuration, never caller-supplied proxy headers. */
export function previewPublicOrigin(
  requestUrl: string,
  environment: PreviewOriginEnvironment,
): URL {
  if (environment.APP_PUBLIC_URL) return validatePublicUrl(environment.APP_PUBLIC_URL);
  if (environment.RAILWAY_PUBLIC_DOMAIN) {
    return domainOrigin(environment.RAILWAY_PUBLIC_DOMAIN);
  }
  if (environment.CODESPACE_NAME && environment.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
    return domainOrigin(
      `${environment.CODESPACE_NAME}-3000.${environment.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`,
    );
  }
  const local = new URL(requestUrl);
  if (['localhost', '127.0.0.1', '[::1]'].includes(local.hostname)) {
    return validatePublicUrl(local.origin);
  }
  throw new Error('Preview public origin requires deployment configuration');
}

export function previewRequestOriginAllowed(header: string | null, expected: URL): boolean {
  if (!header) return true;
  try {
    const supplied = new URL(header);
    return supplied.origin === expected.origin && header === supplied.origin;
  } catch {
    return false;
  }
}

function domainOrigin(domain: string): URL {
  if (
    domain.length > 253 ||
    domain
      .split('.')
      .some(
        (label) =>
          label.length === 0 ||
          label.length > 63 ||
          !/^[a-z0-9-]+$/iu.test(label) ||
          label.startsWith('-') ||
          label.endsWith('-'),
      )
  ) {
    throw new Error('Invalid preview deployment domain');
  }
  return validatePublicUrl(`https://${domain}`);
}

function validatePublicUrl(value: string): URL {
  const origin = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (
    (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && loopback)) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/' ||
    ['0.0.0.0', '[::]'].includes(origin.hostname)
  ) {
    throw new Error('Invalid preview public origin');
  }
  return new URL(origin.origin);
}
