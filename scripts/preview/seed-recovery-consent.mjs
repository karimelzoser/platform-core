import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const tenantId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const customerId = 'dddddddd-0000-0000-0000-000000000031';

export function previewConsentConfiguration(environment) {
  assert.equal(environment.APP_ENV, 'development', 'Consent fixture requires development mode');
  assert.equal(
    environment.ENABLE_DEVELOPMENT_CONNECTOR_FIXTURES,
    'true',
    'Development fixtures must be explicit',
  );
  const api = new URL(environment.API_INTERNAL_URL ?? 'http://127.0.0.1:4000');
  const issuer = new URL(environment.KEYCLOAK_ISSUER ?? 'http://localhost:8080/realms/platform');
  const loopback = (hostname) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  assert.ok(api.protocol === 'http:' && loopback(api.hostname), 'Fixture API must be loopback');
  assert.ok(api.pathname === '/' && !api.search && !api.hash && !api.username && !api.password);
  assert.ok(
    (issuer.protocol === 'http:' || issuer.protocol === 'https:') &&
      (loopback(issuer.hostname) || issuer.hostname.endsWith('.railway.internal')),
    'Fixture Keycloak must be local or private Railway preview',
  );
  assert.ok(
    issuer.pathname === '/realms/platform' &&
      !issuer.search &&
      !issuer.hash &&
      !issuer.username &&
      !issuer.password,
  );
  return { api, issuer };
}

export function preserveExistingPreference(preference) {
  return (
    preference?.status === 'OPTED_IN' ||
    preference?.status === 'OPTED_OUT' ||
    Boolean(preference?.capturedAt)
  );
}

async function seed() {
  const { api, issuer } = previewConsentConfiguration(process.env);
  const request = (url, options = {}) =>
    fetch(url, { ...options, signal: AbortSignal.timeout(5_000) });
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      if (
        (await request(new URL('/health', api))).ok &&
        (await request('http://127.0.0.1:3002/health')).ok
      )
        break;
    } catch {
      /* Application processes may still be starting. */
    }
    if (Date.now() >= deadline)
      throw new Error('Development API/worker did not become ready for consent fixture');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const authenticated = await request(
    new URL(`${issuer.pathname}/protocol/openid-connect/token`, issuer),
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'platform-web',
        username: 'preview-owner',
        password: 'preview-owner-password',
      }),
    },
  );
  assert.ok(authenticated.ok, 'Development Keycloak authentication failed');
  const token = await authenticated.json();
  assert.equal(typeof token.access_token, 'string', 'Keycloak access token is required');
  const customerUrl = new URL(`/v1/customers/${customerId}`, api);
  const customer = async () => {
    const response = await request(customerUrl, {
      headers: {
        authorization: `Bearer ${token.access_token}`,
        'x-tenant-id': tenantId,
      },
    });
    assert.ok(
      response.ok,
      `Protected development customer read failed (HTTP ${response.status}); verify the token issuer matches API configuration`,
    );
    const detail = await response.json();
    assert.equal(detail.id, customerId);
    assert.equal(detail.displayName, 'Recovery Preview Customer');
    assert.ok(Array.isArray(detail.preferences));
    return detail.preferences.find((preference) => preference.channel === 'WHATSAPP');
  };
  if (preserveExistingPreference(await customer())) {
    console.log('Recovery preview preserved existing communication preference.');
    return;
  }
  const { signDevelopmentApiWebhook } = await import('../../packages/connectors/dist/index.js');
  const body = JSON.stringify({
    deliveryId: 'preview-recovery-consent-v1',
    eventType: 'customer.consent.updated',
    resource: { type: 'customer', providerId: 'preview-recovery-customer' },
    payload: {
      kind: 'crm.communication_consent_verified',
      customerId,
      channel: 'WHATSAPP',
      providerConsentId: 'preview-recovery-whatsapp-opt-in-v1',
      occurredAt: new Date().toISOString(),
    },
  });
  const delivery = await request(
    new URL('/v1/webhooks/development-api/99999999-9999-9999-9999-999999999999', api),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-platform-development-api-signature': signDevelopmentApiWebhook(Buffer.from(body)),
      },
      body,
    },
  );
  assert.equal(delivery.status, 202, 'Signed development webhook must be durably acknowledged');
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if ((await customer())?.status === 'OPTED_IN') {
      console.log(
        'Signed development Recovery consent fixture processed through canonical worker.',
      );
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    'Signed Recovery consent fixture was not processed; inspect worker/webhook diagnostics',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await seed();
}
