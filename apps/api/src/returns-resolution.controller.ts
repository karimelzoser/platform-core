import {
  ConflictException,
  Controller,
  ForbiddenException,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { CommandExecutionError } from '@platform/command-execution';
import { AuthenticatedContextService } from './authenticated-context.service.js';
import {
  ReturnsResolutionError,
  ReturnsResolutionService,
} from './returns-resolution.service.js';

@Controller('v1/returns')
export class ReturnsResolutionController {
  public constructor(
    private readonly authentication: AuthenticatedContextService,
    private readonly resolution: ReturnsResolutionService,
  ) {}

  @Post(':returnId/resolve')
  public async resolve(
    @Param('returnId') returnId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    let context;
    try {
      context = await this.authentication.resolve({ authorization, tenantId, correlationId });
    } catch {
      throw new UnauthorizedException('Invalid authentication or tenant membership');
    }
    if (!context.permissions.includes('returns.manage')) {
      throw new ForbiddenException('returns.manage permission is required');
    }
    try {
      return await this.resolution.resolve(context, returnId, idempotencyKey ?? '');
    } catch (error) {
      if (error instanceof CommandExecutionError && error.code === 'authorization_denied') {
        throw new ForbiddenException(error.message);
      }
      if (error instanceof CommandExecutionError || error instanceof ReturnsResolutionError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}
