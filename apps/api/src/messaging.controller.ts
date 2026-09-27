import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { outboundAttachmentSchema } from '@platform/media';
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

  @Get('assignees')
  public async assignees(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    if (!context.permissions.includes('messaging.conversations.assign'))
      throw new ForbiddenException('Conversation assignment permission is required');
    return this.messaging.listAssignees(context);
  }

  @Get('templates')
  public async templates(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    if (!context.permissions.includes('messaging.templates.read'))
      throw new ForbiddenException('Message template read permission is required');
    return this.messaging.listTemplates(context);
  }

  @Post('templates')
  public async createTemplate(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const parsed = this.parseJsonBody(body);
    const channels = ['EMAIL', 'WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'WEB_CHAT', 'API'];
    if (
      typeof parsed.name !== 'string' ||
      !parsed.name.trim() ||
      parsed.name.length > 100 ||
      typeof parsed.body !== 'string' ||
      !parsed.body.trim() ||
      parsed.body.length > 20_000 ||
      (parsed.locale !== 'en' && parsed.locale !== 'ar') ||
      (parsed.channel !== undefined &&
        (typeof parsed.channel !== 'string' || !channels.includes(parsed.channel)))
    )
      throw new BadRequestException('Invalid message template');
    const context = await this.context(authorization, tenantId, correlationId);
    if (!context.permissions.includes('messaging.templates.manage'))
      throw new ForbiddenException('Message template manage permission is required');
    return this.messaging.createTemplate(context, idempotencyKey ?? '', {
      name: parsed.name.trim(),
      locale: parsed.locale,
      channel: parsed.channel,
      body: parsed.body.trim(),
    });
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

  @Post(':conversationId/handover')
  public async handover(
    @Param('conversationId') conversationId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    if (!Buffer.isBuffer(body)) throw new BadRequestException('Handover body must be JSON');
    const parsed = JSON.parse(body.toString('utf8')) as { mode?: unknown };
    if (!['AI', 'COPILOT', 'HUMAN', 'PAUSED'].includes(String(parsed.mode)))
      throw new BadRequestException('Invalid conversation mode');
    const context = await this.context(authorization, tenantId, correlationId);
    if (!context.permissions.includes('messaging.conversations.handover'))
      throw new ForbiddenException('Conversation handover permission is required');
    return this.messaging.handover(
      context,
      idempotencyKey ?? '',
      conversationId,
      parsed.mode as 'AI' | 'COPILOT' | 'HUMAN' | 'PAUSED',
    );
  }

  @Post(':conversationId/assignment')
  public async assign(
    @Param('conversationId') conversationId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const parsed = this.parseJsonBody(body);
    if (typeof parsed.assigneeId !== 'string')
      throw new BadRequestException('assigneeId is required');
    const context = await this.context(authorization, tenantId, correlationId);
    if (!context.permissions.includes('messaging.conversations.assign'))
      throw new ForbiddenException('Conversation assignment permission is required');
    return this.messaging.assign(context, idempotencyKey ?? '', conversationId, parsed.assigneeId);
  }

  @Post(':conversationId/status')
  public async status(
    @Param('conversationId') conversationId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const parsed = this.parseJsonBody(body);
    if (parsed.status !== 'OPEN' && parsed.status !== 'CLOSED')
      throw new BadRequestException('Invalid conversation status');
    const context = await this.context(authorization, tenantId, correlationId);
    if (!context.permissions.includes('messaging.conversations.close'))
      throw new ForbiddenException('Conversation close permission is required');
    return this.messaging.setStatus(context, idempotencyKey ?? '', conversationId, parsed.status);
  }

  @Post(':conversationId/messages')
  public async send(
    @Param('conversationId') conversationId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const parsed = this.parseJsonBody(body);
    if (typeof parsed.body !== 'string' || !parsed.body.trim() || parsed.body.length > 20_000)
      throw new BadRequestException('Message body must contain at most 20,000 characters');
    const context = await this.context(authorization, tenantId, correlationId);
    if (!context.permissions.includes('messaging.conversations.reply'))
      throw new ForbiddenException('Conversation reply permission is required');
    const attachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
    if (attachments.length > 10)
      throw new BadRequestException('At most 10 attachments are allowed');
    const validAttachments = attachments.map((attachment) => {
      const result = outboundAttachmentSchema.safeParse(attachment);
      if (!result.success) throw new BadRequestException('Invalid attachment');
      return result.data;
    });
    return this.messaging.send(
      context,
      idempotencyKey ?? '',
      conversationId,
      parsed.body.trim(),
      validAttachments,
    );
  }

  private parseJsonBody(body: unknown): Record<string, unknown> {
    if (!Buffer.isBuffer(body))
      throw new BadRequestException('Conversation command body must be JSON');
    try {
      const parsed: unknown = JSON.parse(body.toString('utf8'));
      if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error('JSON object required');
      }
      return parsed as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Conversation command body must be a JSON object');
    }
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
