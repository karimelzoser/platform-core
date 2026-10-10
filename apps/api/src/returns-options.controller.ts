import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedContextService } from './authenticated-context.service.js';
import { ReturnsOptionsService } from './returns-options.service.js';

@Controller('v1/returns')
export class ReturnsOptionsController {
  public constructor(
    private readonly authentication: AuthenticatedContextService,
    private readonly options: ReturnsOptionsService,
  ) {}

  @Get(':returnId/options')
  public async get(
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
    if (!context.permissions.includes('returns.read')) {
      throw new ForbiddenException('returns.read permission is required');
    }
    const options = await this.options.get(context, returnId);
    if (!options) throw new NotFoundException('Return not found');
    return options;
  }
}
