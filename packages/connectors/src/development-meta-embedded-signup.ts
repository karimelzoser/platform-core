import { createHash } from 'node:crypto';
import { ConnectorError, type Connector, type ProviderAsset, type WebhookEnvelope } from './index.js';

/**
 * Development-only Meta onboarding/account fixture. It models the boundary
 * between Embedded Signup and PRENEURA without performing any Meta network call.
 */
export const developmentMetaEmbeddedSignupConnector: Connector = {
  manifest: {
    key: 'development-meta-embedded-signup',
    version: '1.0.0',
    category: 'MESSAGING',
    capabilities: ['connection.onboarding', 'provider.assets'],
    credentialSchema: { type: 'development-fixture' },
    settingsSchema: { type: 'object', required: ['allowDevelopmentFixture'] },
  },
  verifyWebhook(): Promise<boolean> {
    return Promise.resolve(false);
  },
  identifyWebhook(): { deliveryId: string; eventType: string } {
    throw new ConnectorError('UNSUPPORTED_OPERATION', false);
  },
  normalizeWebhook(): Promise<WebhookEnvelope> {
    return Promise.reject(new ConnectorError('UNSUPPORTED_OPERATION', false));
  },
  validateConnection({ settings, secretReference }): Promise<void> {
    if (
      settings.allowDevelopmentFixture !== true ||
      !secretReference.startsWith('development://meta-embedded-signup/')
    )
      return Promise.reject(new ConnectorError('AUTHENTICATION_FAILED', false));
    return Promise.resolve();
  },
  health(): Promise<{ latencyMs: number }> {
    return Promise.resolve({ latencyMs: 0 });
  },
  discoverAssets(input): Promise<readonly ProviderAsset[]> {
    const fingerprint = createHash('sha256')
      .update(input.connectionId)
      .digest('hex')
      .slice(0, 12);
    return Promise.resolve([
      {
        assetType: 'meta_business_account',
        providerId: `business-${fingerprint}`,
        name: 'Development Meta Business',
        state: 'ACTIVE',
        attributes: { developmentOnly: true },
      },
      {
        assetType: 'whatsapp_business_account',
        providerId: `waba-${fingerprint}`,
        name: 'Development WABA',
        state: 'ACTIVE',
        attributes: { developmentOnly: true },
      },
      {
        assetType: 'whatsapp_phone_number',
        providerId: `phone-${fingerprint}`,
        name: 'Development WhatsApp Phone',
        state: 'ACTIVE',
        attributes: { developmentOnly: true, displayPhoneNumber: '+201000000000' },
      },
      {
        assetType: 'facebook_page',
        providerId: `page-${fingerprint}`,
        name: 'Development Facebook Page',
        state: 'ACTIVE',
        attributes: { developmentOnly: true },
      },
      {
        assetType: 'instagram_business_account',
        providerId: `instagram-${fingerprint}`,
        name: 'Development Instagram Business',
        state: 'ACTIVE',
        attributes: { developmentOnly: true },
      },
    ]);
  },
};
