import { createHash } from 'node:crypto';
import { z } from 'zod';

export const actorTypeSchema = z.enum(['USER', 'AI', 'SYSTEM', 'SERVICE', 'INTEGRATION']);
export const riskSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export const boundedDimensionValueSchema = z.union([
  z.string().max(256),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const boundedDimensionsSchema = z
  .record(z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/), boundedDimensionValueSchema)
  .superRefine((value, ctx) => {
    if (Object.keys(value).length > 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'bounded dimensions may contain at most 32 keys',
      });
    }
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 4096) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'bounded dimensions may not exceed 4096 bytes',
      });
    }
  });

export type BoundedDimensions = z.infer<typeof boundedDimensionsSchema>;

export const correlationContextSchema = z.object({
  requestId: z.string().min(1).max(300),
  correlationId: z.string().min(1).max(300),
  causationId: z.string().min(1).max(300).optional(),
  traceId: z.string().regex(/^[0-9a-f]{32}$/).optional(),
  spanId: z.string().regex(/^[0-9a-f]{16}$/).optional(),
});

export type CorrelationContext = z.infer<typeof correlationContextSchema>;

export const operationalErrorSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{2,127}$/),
  category: z.enum([
    'VALIDATION',
    'AUTHENTICATION',
    'AUTHORIZATION',
    'NOT_FOUND',
    'CONFLICT',
    'PROVIDER',
    'TIMEOUT',
    'TRANSIENT',
    'INTERNAL',
  ]),
  retryable: z.boolean(),
  correlationId: z.string().min(1).max(300),
  resource: z
    .object({
      type: z.string().regex(/^[a-z][a-z0-9_.-]{0,127}$/),
      id: z.string().min(1).max(300),
    })
    .optional(),
  safeDetails: boundedDimensionsSchema.default({}),
});

export type OperationalError = z.infer<typeof operationalErrorSchema>;

export const structuredLogSchema = z.object({
  timestamp: z.string().datetime(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  event: z.string().regex(/^[a-z][a-z0-9_.-]{2,127}$/),
  service: z.string().min(1).max(100),
  tenantId: z.string().uuid().optional(),
  requestId: z.string().min(1).max(300),
  correlationId: z.string().min(1).max(300),
  causationId: z.string().min(1).max(300).optional(),
  traceId: z.string().regex(/^[0-9a-f]{32}$/).optional(),
  spanId: z.string().regex(/^[0-9a-f]{16}$/).optional(),
  resource: z
    .object({
      type: z.string().regex(/^[a-z][a-z0-9_.-]{0,127}$/),
      id: z.string().min(1).max(300),
    })
    .optional(),
  attributes: boundedDimensionsSchema.default({}),
  error: operationalErrorSchema.optional(),
});

export type StructuredLog = z.infer<typeof structuredLogSchema>;

export function encodeStructuredLog(entry: StructuredLog): string {
  return JSON.stringify(structuredLogSchema.parse(entry));
}

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

export const meterDefinitionSchema = z.object({
  meterKey: z.string().regex(/^[a-z][a-z0-9_.-]{2,127}$/),
  version: z.number().int().positive(),
  description: z.string().min(1).max(1000),
  unit: z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/),
  aggregationBehavior: z.enum(['SUM', 'COUNT', 'MAX', 'LAST']),
  sourceOfTruth: z.string().min(1).max(300),
  retryCreatesUnit: z.boolean(),
  mayBeBillable: z.boolean(),
  providerCostApplies: z.boolean(),
  allowedDimensions: z
    .array(z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/))
    .max(32),
  status: z.enum(['ACTIVE', 'DEPRECATED']),
});

export type MeterDefinition = z.infer<typeof meterDefinitionSchema>;

export const usageRecordSchema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    meterKey: z.string().regex(/^[a-z][a-z0-9_.-]{2,127}$/),
    meterVersion: z.number().int().positive(),
    quantity: z.number().positive().finite(),
    unit: z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/),
    occurredAt: z.string().datetime(),
    sourceType: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
    sourceId: z.string().min(1).max(300),
    resourceType: z.string().regex(/^[a-z][a-z0-9_.-]{0,127}$/),
    resourceId: z.string().min(1).max(300),
    providerKey: z.string().regex(/^[a-z][a-z0-9_.-]{0,127}$/).optional(),
    connectionId: z.string().uuid().optional(),
    estimatedCost: z.number().nonnegative().finite().optional(),
    costCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
    costState: z.enum(['NONE', 'ESTIMATED', 'FINALIZED']).default('NONE'),
    correlationId: z.string().min(1).max(300),
    causationId: z.string().min(1).max(300).optional(),
    idempotencyKey: z.string().min(1).max(500),
    boundedMetadata: boundedDimensionsSchema.default({}),
  })
  .superRefine((value, ctx) => {
    const hasCost = value.estimatedCost !== undefined || value.costCurrency !== undefined;
    if (hasCost && (value.estimatedCost === undefined || value.costCurrency === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'estimatedCost and costCurrency must be supplied together',
        path: ['estimatedCost'],
      });
    }
    if (!hasCost && value.costState !== 'NONE') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'costState must be NONE when no cost is present',
        path: ['costState'],
      });
    }
    if (hasCost && value.costState === 'NONE') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'costState must describe an estimated or finalized cost',
        path: ['costState'],
      });
    }
  });

export type UsageRecord = z.infer<typeof usageRecordSchema>;

export const analyticsEventDimensionsSchema = z.object({
  tenantId: z.string().uuid(),
  eventType: z.string().regex(/^[a-z][a-z0-9_.-]{2,127}$/),
  eventVersion: z.number().int().positive(),
  occurredAt: z.string().datetime(),
  resourceType: z.string().regex(/^[a-z][a-z0-9_.-]{0,127}$/),
  resourceId: z.string().min(1).max(300),
  correlationId: z.string().min(1).max(300),
  causationId: z.string().min(1).max(300).optional(),
  dimensions: boundedDimensionsSchema.default({}),
});

export type AnalyticsEventDimensions = z.infer<typeof analyticsEventDimensionsSchema>;

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
