import { approvalActionDigest, type ApprovalAction } from '@platform/contracts';
import { toOpaInput, type AuthorizationSubject } from './policy-input.js';
import type { OpaDecision } from './index.js';

export interface ApprovalEvidence {
  id: string;
  actionDigest: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELED' | 'EXECUTED' | 'FAILED';
  expiresAt: Date;
}

export interface DecisionClient {
  decide(input: Record<string, unknown>): Promise<OpaDecision>;
}

export type CommandAuthorization =
  | { kind: 'ALLOWED'; approvalId?: string }
  | { kind: 'APPROVAL_REQUIRED'; reason: string }
  | { kind: 'DENIED'; reason: string };

/**
 * The single authorization decision point for protected domain commands.
 * Callers must invoke it before opening the mutation transaction.
 */
export class CommandAuthorizer {
  public constructor(
    private readonly opa: DecisionClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async authorize(
    subject: AuthorizationSubject,
    action: ApprovalAction,
    approval?: ApprovalEvidence,
  ): Promise<CommandAuthorization> {
    if (subject.tenantId !== action.resource.tenantId)
      return { kind: 'DENIED', reason: 'tenant_mismatch' };
    if (!subject.permissions.includes(action.permission))
      return { kind: 'DENIED', reason: 'permission_missing' };

    const decision = await this.opa.decide(toOpaInput(subject, action));
    if (decision.allow) return { kind: 'ALLOWED' };
    if (!decision.requires_approval) return { kind: 'DENIED', reason: decision.reason };

    if (!approval) return { kind: 'APPROVAL_REQUIRED', reason: decision.reason };
    if (approval.status !== 'APPROVED') return { kind: 'DENIED', reason: 'approval_not_approved' };
    if (approval.expiresAt <= this.now()) return { kind: 'DENIED', reason: 'approval_expired' };
    if (approval.actionDigest !== approvalActionDigest(action))
      return { kind: 'DENIED', reason: 'approval_digest_mismatch' };
    return { kind: 'ALLOWED', approvalId: approval.id };
  }
}
