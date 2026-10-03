import assert from 'node:assert/strict';
import test from 'node:test';
import { ConnectorRegistry } from './index.js';
import { developmentMetaEmbeddedSignupConnector } from './development-meta-embedded-signup.js';

void test('Meta Embedded Signup fixture exposes deterministic account assets without provider calls', async () => {
  const connectionId = 'aaaaaaaa-8888-8888-8888-888888888888';
  await developmentMetaEmbeddedSignupConnector.validateConnection({
    settings: { allowDevelopmentFixture: true },
    secretReference: 'development://meta-embedded-signup/preview',
  });
  await assert.rejects(
    developmentMetaEmbeddedSignupConnector.validateConnection({
      settings: { allowDevelopmentFixture: true },
      secretReference: 'development://whatsapp-cloud-api/preview',
    }),
    { code: 'AUTHENTICATION_FAILED' },
  );

  const first = await developmentMetaEmbeddedSignupConnector.discoverAssets?.({
    connectionId,
    settings: { allowDevelopmentFixture: true },
    secretReference: 'development://meta-embedded-signup/preview',
  });
  const retry = await developmentMetaEmbeddedSignupConnector.discoverAssets?.({
    connectionId,
    settings: { allowDevelopmentFixture: true },
    secretReference: 'development://meta-embedded-signup/preview',
  });
  assert.deepEqual(first, retry);
  assert.deepEqual(
    first?.map((asset) => asset.assetType),
    [
      'meta_business_account',
      'whatsapp_business_account',
      'whatsapp_phone_number',
      'facebook_page',
      'instagram_business_account',
    ],
  );
  assert.ok(first.every((asset) => asset.attributes.developmentOnly === true));
  assert.equal(
    await developmentMetaEmbeddedSignupConnector.verifyWebhook({
      headers: new Headers(),
      rawBody: new Uint8Array(),
    }),
    false,
  );
  assert.throws(
    () =>
      developmentMetaEmbeddedSignupConnector.identifyWebhook({
        headers: new Headers(),
        body: {},
      }),
    { code: 'UNSUPPORTED_OPERATION' },
  );

  const registry = new ConnectorRegistry();
  registry.register(developmentMetaEmbeddedSignupConnector);
  assert.deepEqual(registry.keys(), ['development-meta-embedded-signup']);
});
