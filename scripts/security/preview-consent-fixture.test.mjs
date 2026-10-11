import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  preserveExistingPreference,
  previewConsentConfiguration,
} from '../preview/seed-recovery-consent.mjs';

test('development consent bootstrap rejects production, disabled fixtures and remote API origins', () => {
  const environment = { APP_ENV: 'development', ENABLE_DEVELOPMENT_CONNECTOR_FIXTURES: 'true' };
  assert.equal(previewConsentConfiguration(environment).api.origin, 'http://127.0.0.1:4000');
  assert.throws(() => previewConsentConfiguration({ ...environment, APP_ENV: 'production' }));
  assert.throws(() =>
    previewConsentConfiguration({ ...environment, ENABLE_DEVELOPMENT_CONNECTOR_FIXTURES: 'false' }),
  );
  assert.throws(() =>
    previewConsentConfiguration({
      ...environment,
      API_INTERNAL_URL: 'https://production.example.invalid',
    }),
  );
  assert.throws(() =>
    previewConsentConfiguration({
      ...environment,
      KEYCLOAK_ISSUER: 'http://localhost:8080/realms/master',
    }),
  );
  assert.throws(() =>
    previewConsentConfiguration({
      ...environment,
      KEYCLOAK_ISSUER: 'https://external.example.invalid/realms/platform',
    }),
  );
});

test('preview restarts do not manufacture a new consent after operator opt-out', () => {
  assert.equal(preserveExistingPreference({ status: 'OPTED_OUT', capturedAt: null }), true);
  assert.equal(preserveExistingPreference({ status: 'OPTED_IN' }), true);
  assert.equal(
    preserveExistingPreference({ status: 'UNKNOWN', capturedAt: '2026-10-11T00:00:00Z' }),
    true,
  );
  assert.equal(preserveExistingPreference({ status: 'UNKNOWN', capturedAt: null }), false);
});
