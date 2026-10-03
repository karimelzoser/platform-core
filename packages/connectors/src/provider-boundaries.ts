import { z } from 'zod';

/**
 * Provider families are an allowlisted design contract, not a claim that a
 * production adapter is registered. Network adapters remain opt-in and must
 * satisfy the Connector interface before they can be used at runtime.
 */
export const providerBoundarySchema = z.object({
  key: z.enum([
    'meta-embedded-signup',
    'whatsapp-cloud-api',
    'instagram-messaging',
    'messenger-platform',
    'email',
    'web-chat',
    'api',
    'shopify-public-app',
    'woocommerce',
  ]),
  displayName: z.string().min(1),
  category: z.enum(['COMMERCE', 'MESSAGING', 'EMAIL', 'GENERIC']),
  capabilities: z.array(z.string().min(1)).readonly(),
  implementationState: z.enum(['PLANNED', 'DEVELOPMENT_FIXTURE']),
});

export type ProviderBoundary = z.infer<typeof providerBoundarySchema>;

export const providerBoundaries: readonly ProviderBoundary[] = [
  {
    key: 'meta-embedded-signup',
    displayName: 'Meta Embedded Signup',
    category: 'MESSAGING',
    capabilities: ['connection.onboarding', 'provider.assets'],
    implementationState: 'DEVELOPMENT_FIXTURE',
  },
  {
    key: 'whatsapp-cloud-api',
    displayName: 'WhatsApp Cloud API',
    category: 'MESSAGING',
    capabilities: [
      'webhooks',
      'sync',
      'messaging.inbound',
      'messaging.outbound',
      'provider.actions',
    ],
    implementationState: 'DEVELOPMENT_FIXTURE',
  },
  {
    key: 'instagram-messaging',
    displayName: 'Instagram Messaging',
    category: 'MESSAGING',
    capabilities: [
      'webhooks',
      'sync',
      'messaging.inbound',
      'messaging.outbound',
      'provider.actions',
    ],
    implementationState: 'DEVELOPMENT_FIXTURE',
  },
  {
    key: 'messenger-platform',
    displayName: 'Messenger Platform',
    category: 'MESSAGING',
    capabilities: [
      'webhooks',
      'sync',
      'messaging.inbound',
      'messaging.outbound',
      'provider.actions',
    ],
    implementationState: 'DEVELOPMENT_FIXTURE',
  },
  {
    key: 'email',
    displayName: 'Email',
    category: 'EMAIL',
    capabilities: ['webhooks', 'sync', 'messaging.inbound', 'messaging.outbound'],
    implementationState: 'DEVELOPMENT_FIXTURE',
  },
  {
    key: 'web-chat',
    displayName: 'Web Chat',
    category: 'MESSAGING',
    capabilities: ['webhooks', 'sync', 'messaging.inbound', 'messaging.outbound'],
    implementationState: 'DEVELOPMENT_FIXTURE',
  },
  {
    key: 'api',
    displayName: 'API',
    category: 'GENERIC',
    capabilities: ['webhooks', 'sync', 'provider.actions'],
    implementationState: 'DEVELOPMENT_FIXTURE',
  },
  {
    key: 'shopify-public-app',
    displayName: 'Shopify Public App',
    category: 'COMMERCE',
    capabilities: [
      'connection.onboarding',
      'webhooks',
      'sync',
      'provider.assets',
      'provider.actions',
    ],
    implementationState: 'DEVELOPMENT_FIXTURE',
  },
  {
    key: 'woocommerce',
    displayName: 'WooCommerce',
    category: 'COMMERCE',
    capabilities: ['webhooks', 'sync', 'provider.assets', 'provider.actions'],
    implementationState: 'DEVELOPMENT_FIXTURE',
  },
].map((boundary) => providerBoundarySchema.parse(boundary));

export function providerBoundary(key: string): ProviderBoundary | undefined {
  return providerBoundaries.find((boundary) => boundary.key === key);
}
