import { createHash } from 'node:crypto';
import { z } from 'zod';

export const actorTypeSchema = z.enum(['USER', 'AI', 'SYSTEM', 'SERVICE', 'INTEGRATION']);
export const riskSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export const eventEnvelopeSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(3),
  version: z.number().int().positive(),
  tenantId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  source: z.string().min(1),
  correlationId: z.string().min(1).optional(),
  causationId: z.string().min(1).optional(),
  actor: z.object({ type: actorTypeSchema, id: z.string().uuid().optional() }),
  resource: z.object({ type: z.string().min(1), id: z.string().min(1) }),
  data: z.record(z.unknown()),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export const approvalActionSchema = z.object({
  action: z.string().min(3),
  permission: z.string().min(3),
  risk: riskSchema,
  resource: z.object({
    type: z.string().min(1),
    id: z.string().min(1),
    tenantId: z.string().uuid(),
  }),
  input: z.record(z.unknown()),
});

export type ApprovalAction = z.infer<typeof approvalActionSchema>;

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(',')}}`;
}

/** Stable digest prevents an approval from being reused for a changed action. */
export function approvalActionDigest(action: ApprovalAction): string {
  return createHash('sha256')
    .update(canonicalize(approvalActionSchema.parse(action)))
    .digest('hex');
}

export const connectorManifestSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]*$/),
  version: z.string().min(1),
  category: z.enum(['COMMERCE', 'MESSAGING', 'SHIPPING', 'PAYMENT', 'EMAIL', 'GENERIC']),
  capabilities: z.array(z.string()).readonly(),
  credentialSchema: z.record(z.unknown()),
  settingsSchema: z.record(z.unknown()),
});

export type ConnectorManifest = z.infer<typeof connectorManifestSchema>;
