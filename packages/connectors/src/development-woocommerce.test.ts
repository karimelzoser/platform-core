import assert from 'node:assert/strict';
import test from 'node:test';
import { ConnectorRegistry } from './index.js';
import {
  developmentWooCommerceConnector,
  signDevelopmentWooCommerceWebhook,
} from './development-woocommerce.js';

void test('WooCommerce fixture exercises webhook, sync, assets, and action contracts', async () => {
  const order = { id: 321, status: 'processing', total: '199.00' };
  const rawBody = Buffer.from(JSON.stringify(order));
  const headers = new Headers({
    'x-wc-webhook-signature': signDevelopmentWooCommerceWebhook(rawBody),
    'x-wc-webhook-delivery-id': 'woo-delivery-1',
    'x-wc-webhook-topic': 'order.updated',
  });

  assert.equal(await developmentWooCommerceConnector.verifyWebhook({ headers, rawBody }), true);
  assert.equal(
    await developmentWooCommerceConnector.verifyWebhook({
      headers: new Headers({ 'x-wc-webhook-signature': 'invalid' }),
      rawBody,
    }),
    false,
  );
  assert.deepEqual(
    developmentWooCommerceConnector.identifyWebhook({ headers, body: order }),
    { deliveryId: 'woo-delivery-1', eventType: 'order.updated' },
  );
  assert.deepEqual(
    await developmentWooCommerceConnector.normalizeWebhook({ headers, body: order }),
    {
      deliveryId: 'woo-delivery-1',
      eventType: 'woocommerce.order.updated',
      resource: { type: 'woocommerce_order', providerId: '321' },
      payload: {
        kind: 'commerce.provider_event',
        provider: 'woocommerce',
        topic: 'order.updated',
        data: order,
      },
    },
  );

  const connectionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const settings = {
    allowDevelopmentFixture: true,
    storeUrl: 'https://shop.example.test',
  };
  await developmentWooCommerceConnector.validateConnection({
    settings,
    secretReference: 'development://woocommerce/preview',
  });
  await assert.rejects(
    developmentWooCommerceConnector.validateConnection({
      settings: { ...settings, storeUrl: 'http://shop.example.test' },
      secretReference: 'development://woocommerce/preview',
    }),
    { code: 'AUTHENTICATION_FAILED' },
  );
  assert.deepEqual(
    await developmentWooCommerceConnector.discoverAssets?.({
      connectionId,
      settings,
      secretReference: 'development://woocommerce/preview',
    }),
    [
      {
        assetType: 'woocommerce_store',
        providerId: 'https://shop.example.test',
        name: 'https://shop.example.test',
        state: 'ACTIVE',
        attributes: { developmentOnly: true },
      },
    ],
  );
  assert.deepEqual(
    await developmentWooCommerceConnector.sync?.({
      connectionId,
      kind: 'BACKFILL',
      cursor: { page: 2 },
      settings,
      secretReference: 'development://woocommerce/preview',
    }),
    {
      cursor: {
        page: 2,
        developmentFixture: true,
        syncKind: 'BACKFILL',
        completed: true,
      },
      pages: 0,
      items: 0,
      hasMore: false,
    },
  );
  const subscription = await developmentWooCommerceConnector.registerWebhook?.({
    connectionId,
    callbackUrl: 'https://preview.example.test/v1/webhooks/development-woocommerce/connection',
    settings,
    secretReference: 'development://woocommerce/preview',
  });
  assert.match(subscription?.providerSubscriptionId ?? '', /^development-woocommerce-webhook-/u);

  const actionInput = {
    connectionId,
    actionType: 'development.woocommerce.echo',
    idempotencyKey: 'woo-action-1',
    input: { orderId: 321 },
    settings,
    secretReference: 'development://woocommerce/preview',
  };
  const first = await developmentWooCommerceConnector.executeAction?.(actionInput);
  const retry = await developmentWooCommerceConnector.executeAction?.(actionInput);
  assert.equal(first?.providerActionId, retry?.providerActionId);
  assert.deepEqual(first?.result, { echoed: { orderId: 321 }, developmentOnly: true });
  await assert.rejects(
    developmentWooCommerceConnector.executeAction?.({
      ...actionInput,
      actionType: 'commerce.order.refund',
    }) ?? Promise.reject(new Error('missing executeAction')),
    { code: 'UNSUPPORTED_OPERATION' },
  );

  const registry = new ConnectorRegistry();
  registry.register(developmentWooCommerceConnector);
  assert.deepEqual(registry.keys(), ['development-woocommerce']);
});
