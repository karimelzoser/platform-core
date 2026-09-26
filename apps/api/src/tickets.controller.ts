import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedContextService } from './authenticated-context.service.js';
import { TicketsService, type CreateTicketInput, type TicketPriority } from './tickets.service.js';

@Controller('v1/tickets')
export class TicketsController {
  public constructor(
    private readonly authentication: AuthenticatedContextService,
    private readonly tickets: TicketsService,
  ) {}

  @Get()
  public async list(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'tickets.read');
    return this.tickets.list(context);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  public async create(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'tickets.create');
    return this.tickets.create(context, idempotencyKey ?? '', parseCreateTicket(body));
  }

  @Post(':ticketId/comments')
  public async addComment(
    @Param('ticketId') ticketId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const parsed = parseComment(body);
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'tickets.update');
    return this.tickets.addComment(
      context,
      idempotencyKey ?? '',
      ticketId,
      parsed.body,
      parsed.visibility,
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

  private assertPermission(permissions: readonly string[], permission: string): void {
    if (!permissions.includes(permission))
      throw new ForbiddenException(`${permission} permission is required`);
  }
}

function parseCreateTicket(body: unknown): CreateTicketInput {
  const parsed = parseJsonObject(body);
  if (typeof parsed.title !== 'string' || !parsed.title.trim())
    throw new BadRequestException('Ticket title is required');
  if (parsed.customerId !== undefined && typeof parsed.customerId !== 'string')
    throw new BadRequestException('customerId must be a string');
  if (parsed.conversationId !== undefined && typeof parsed.conversationId !== 'string')
    throw new BadRequestException('conversationId must be a string');
  const priority = parsed.priority ?? 'NORMAL';
  if (typeof priority !== 'string' || !['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority))
    throw new BadRequestException('Invalid ticket priority');
  return {
    title: parsed.title.trim(),
    ...(typeof parsed.customerId === 'string' ? { customerId: parsed.customerId } : {}),
    ...(typeof parsed.conversationId === 'string' ? { conversationId: parsed.conversationId } : {}),
    priority: priority as TicketPriority,
  };
}

function parseComment(body: unknown): {
  body: string;
  visibility: 'INTERNAL' | 'CUSTOMER_VISIBLE';
} {
  const parsed = parseJsonObject(body);
  if (typeof parsed.body !== 'string' || !parsed.body.trim())
    throw new BadRequestException('Comment body is required');
  const visibility = parsed.visibility ?? 'INTERNAL';
  if (typeof visibility !== 'string' || !['INTERNAL', 'CUSTOMER_VISIBLE'].includes(visibility))
    throw new BadRequestException('Invalid comment visibility');
  return {
    body: parsed.body.trim(),
    visibility: visibility as 'INTERNAL' | 'CUSTOMER_VISIBLE',
  };
}

function parseJsonObject(body: unknown): Record<string, unknown> {
  if (!Buffer.isBuffer(body)) throw new BadRequestException('Ticket body must be JSON');
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'));
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new BadRequestException('Ticket body must be a JSON object');
  }
}
