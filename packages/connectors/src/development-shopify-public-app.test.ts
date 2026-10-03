import assert from 'node:assert/strict';
import test from 'node:test';
import { ConnectorRegistry } from './index.js';
import {
  developmentShopifyPublicAppConnector,
  signDevelopmentShopifyWebhook,
} from './development-shopify-public-app.js';

void test('Shopify public app fixture exercises webhook, sync, assets, and action contracts', async () => {
  const order = { id: 12345, name: '#1001', financial_status: 'paid' };
  const rawBody = Buffer.from(JSON.stringify(order));
  const headers = new Headers({
    'x-shopify-hmac-sha256': signDevelopmentShopifyWebhook(rawBody),
    'x-shopify-webhook-id': 'shopify-delivery-1',
    'x-shopify-topic': 'orders/updated',
    'x-shopify-shop-domain': 'preview-store.myshopify.com',
  });

  assert.equal(
    await developmentShopifyPublicAppConnector.verifyWebhook({ headers, rawBody }),
    true,
  );
  assert.equal(
    await developmentShopifyPublicAppConnector.verifyWebhook({
      headers: new Headers({ 'x-shopify-hmac-sha256': 'invalid' }),
      rawBody,
    }),
    false,
  );
  assert.deepEqual(
    developmentShopifyPublicAppConnector.identifyWebhook({ headers, body: order }),
    { deliveryId: 'shopify-delivery-1', eventType: 'orders/updated' },
  );
  assert.deepEqual(
    await developmentShopifyPublicAppConnector.normalizeWebhook({ headers, body: order }),
    {
      deliveryId: 'shopify-delivery-1',
      eventType: 'shopify.orders.updated',
      resource: { type: 'shopify_order', providerId: '12345' },
      payload: {
        kind: 'commerce.provider_event',
        provider: 'shopify',
        topic: 'orders/updated',
        data: order,
      },
    },
  );

  const connectionId = 'aaaaaaaa-9999-9999-9999-999999999999';
  const settings = {
    allowDevelopmentFixture: true,
    shopDomain: 'preview-store.myshopify.com',
    apiVersion: '2026-10',
  };
  await developmentShopifyPublicAppConnector.validateConnection({
    settings,
    secretReference: 'development://shopify-public-app/preview',
  });
  await assert.rejects(
    developmentShopifyPublicAppConnector.validateConnection({
      settings: { ...settings, shopDomain: 'not-a-shopify-domain.example' },
      secretReference: 'development://shopify-public-app/preview',
    }),
    { code: 'AUTHENTICATION_FAILED' },
  );
  assert.deepEqual(
    await developmentShopifyPublicAppConnector.discoverAssets?.({
      connectionId,
      settings,
      secretReference: 'development://shopify-public-app/preview',
    }),
    [
      {
        assetType: 'shopify_shop',
        providerId: 'preview-store.myshopify.com',
        name: 'preview-store.myshopify.com',
        state: 'ACTIVE',
        attributes: { developmentOnly: true, apiVersion: '2026-10' },
      },
    ],
  );
  assert.deepEqual(
    await developmentShopifyPublicAppConnector.sync?.({
      connectionId,
      kind: 'RECONCILIATION',
      cursor: { highWaterMark: '2026-10-01T00:00:00.000Z' },
      settings,
      secretReference: 'development://shopify-public-app/preview',
    }),
    {
      cursor: {
        highWaterMark: '2026-10-01T00:00:00.000Z',
        developmentFixture: true,
        syncKind: 'RECONCILIATION',
        completed: true,
      },
      pages: 0,
      items: 0,
      hasMore: false,
    },
  );
  const subscription = await developmentShopifyPublicAppConnector.registerWebhook?.({
    connectionId,
    callbackUrl: 'https://preview.example.test/v1/webhooks/development-shopify-public-app/connection',
    settings,
    secretReference: 'development://shopify-public-app/preview',
  });
  assert.match(subscription?.providerSubscriptionId ?? '', /^development-shopify-webhook-/u);

  const actionInput = {
    connectionId,
    actionType: 'development.shopify.echo',
    idempotencyKey: 'shopify-action-1',
    input: { orderId: 'gid://shopify/Order/12345' },
    settings,
    secretReference: 'development://shopify-public-app/preview',
  };
  const first = await developmentShopifyPublicAppConnector.executeAction?.(actionInput);
  const retry = await developmentShopifyPublicAppConnector.executeAction?.(actionInput);
  assert.equal(first?.providerActionId, retry?.providerActionId);
  assert.deepEqual(first?.result, {
    echoed: { orderId: 'gid://shopify/Order/12345' },
    developmentOnly: true,
  });
  await assert.rejects(
    developmentShopifyPublicAppConnector.executeAction?.({
      ...actionInput,
      actionType: 'commerce.order.cancel',
    }) ?? Promise.reject(new Error('missing executeAction')),
    { code: 'UNSUPPORTED_OPERATION' },
  );

  const registry = new ConnectorRegistry();
  registry.register(developmentShopifyPublicAppConnector);
  assert.deepEqual(registry.keys(), ['development-shopify-public-app']);
});
