import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApprovalError, ApprovalService } from './approval.service.js';
import { AuthenticatedContextService } from './authenticated-context.service.js';

@Controller('v1/approvals')
export class ApprovalsController {
  public constructor(
    private readonly authentication: AuthenticatedContextService,
    private readonly approvals: ApprovalService,
  ) {}

  @Get()
  public async list(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    return this.invoke(async () =>
      this.approvals.list(await this.context(authorization, tenantId, correlationId)),
    );
  }

  @Post(':approvalId/decision')
  public async decide(
    @Param('approvalId') approvalId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    if (!Buffer.isBuffer(body)) throw new BadRequestException('Decision body must be JSON');
    return this.invoke(async () =>
      this.approvals.decide(
        await this.context(authorization, tenantId, correlationId),
        approvalId,
        JSON.parse(body.toString('utf8')),
      ),
    );
  }

  @Post('merge-request')
  public async requestMerge(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    if (!Buffer.isBuffer(body)) throw new BadRequestException('Approval body must be JSON');
    return this.invoke(async () =>
      this.approvals.requestMerge(
        await this.context(authorization, tenantId, correlationId),
        JSON.parse(body.toString('utf8')),
      ),
    );
  }

  private async context(
    authorization: string | undefined,
    tenantId: string | undefined,
    correlationId: string | undefined,
  ) {
    try {
      return await this.authentication.resolve({ authorization, tenantId, correlationId });
    } catch {
      throw new UnauthorizedException('Invalid authentication or tenant membership');
    }
  }

  private async invoke<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ApprovalError || error instanceof Error)
        throw new BadRequestException(error.message);
      throw error;
    }
  }
}
