import { approvalActionDigest, type ApprovalAction } from '@platform/contracts';
import { z } from 'zod';
export { toOpaInput, type AuthorizationSubject } from './policy-input.js';

const opaDecisionSchema = z.object({
  allow: z.boolean(),
  requires_approval: z.boolean(),
  reason: z.string().min(1),
  policy_version: z.string().min(1),
});

export type OpaDecision = z.infer<typeof opaDecisionSchema>;

export interface OpaClientOptions {
  endpoint: URL;
  fetcher?: typeof fetch;
}

export class OpaClient {
  private readonly fetcher: typeof fetch;

  public constructor(private readonly options: OpaClientOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  /** Protected writes fail closed for network, HTTP, and contract failures. */
  public async decide(input: Record<string, unknown>, timeoutMs = 1_500): Promise<OpaDecision> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    try {
      const response = await this.fetcher(this.options.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ input }),
        signal: controller.signal,
      });
      if (!response.ok) return this.denied(`opa_http_${String(response.status)}`);
      const body: unknown = await response.json();
      const decision = (body as { result?: unknown }).result;
      return opaDecisionSchema.safeParse(decision).data ?? this.denied('opa_invalid_response');
    } catch {
      return this.denied('opa_unavailable');
    } finally {
      clearTimeout(timer);
    }
  }

  private denied(reason: string): OpaDecision {
    return { allow: false, requires_approval: false, reason, policy_version: 'unavailable' };
  }
}

export function assertApprovalMatches(action: ApprovalAction, storedDigest: string): void {
  if (approvalActionDigest(action) !== storedDigest) {
    throw new Error('Approval action digest mismatch');
  }
}
