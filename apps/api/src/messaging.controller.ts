import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedContextService } from './authenticated-context.service.js';
import { MessagingService } from './messaging.service.js';

@Controller('v1/conversations')
export class MessagingController {
  public constructor(
    private readonly authentication: AuthenticatedContextService,
    private readonly messaging: MessagingService,
  ) {}

  @Get()
  public async list(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    return this.messaging.listConversations(context);
  }

  @Get(':conversationId/messages')
  public async messages(
    @Param('conversationId') conversationId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    return this.messaging.messages(context, conversationId);
  }

  private async context(
    authorization: string | undefined,
    tenantId: string | undefined,
    correlationId: string | undefined,
  ) {
    try {
      const context = await this.authentication.resolve({ authorization, tenantId, correlationId });
      if (!context.permissions.includes('messaging.conversations.read'))
        throw new ForbiddenException('Conversation read permission is required');
      return context;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException('Invalid authentication or tenant membership');
    }
  }
}
