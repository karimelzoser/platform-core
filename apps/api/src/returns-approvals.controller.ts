import { Controller, ForbiddenException, Get, Headers, Param, UnauthorizedException } from '@nestjs/common';
import { AuthenticatedContextService } from './authenticated-context.service.js';
import { ReturnsApprovalService } from './returns-approval.service.js';

@Controller('v1/returns')
export class ReturnsApprovalsController {
  public constructor(
    private readonly authentication: AuthenticatedContextService,
    private readonly approvals: ReturnsApprovalService,
  ) {}

  @Get(':returnId/approvals')
  public async list(
    @Param('returnId') returnId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    let context;
    try {
      context = await this.authentication.resolve({ authorization, tenantId, correlationId });
    } catch {
      throw new UnauthorizedException('Invalid authentication or tenant membership');
    }
    if (!context.permissions.includes('policy.approvals.read')) {
      throw new ForbiddenException('policy.approvals.read permission is required');
    }
    return this.approvals.list(context, returnId);
  }
}
