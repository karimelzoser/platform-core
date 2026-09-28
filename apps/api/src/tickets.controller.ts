import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedContextService } from './authenticated-context.service.js';
import {
  TicketsService,
  type CreateTicketInput,
  type TicketPriority,
  type TicketResolutionStatus,
  type TicketSlaPolicyInput,
  type TicketSlaStatus,
  type UpdateTicketInput,
} from './tickets.service.js';

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

  @Get('assignees')
  public async assignees(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'tickets.assign');
    return this.tickets.listAssignees(context);
  }

  @Get('sla-policies')
  public async slaPolicies(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'tickets.read');
    return this.tickets.listSlaPolicies(context);
  }

  @Post('sla-policies')
  @HttpCode(HttpStatus.CREATED)
  public async createSlaPolicy(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'tickets.sla.manage');
    return this.tickets.createSlaPolicy(context, idempotencyKey ?? '', parseSlaPolicy(body));
  }

  @Get(':ticketId')
  public async get(
    @Param('ticketId') ticketId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'tickets.read');
    assertUuid(ticketId, 'ticketId');
    const ticket = await this.tickets.get(context, ticketId);
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  @Patch(':ticketId')
  public async update(
    @Param('ticketId') ticketId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'tickets.update');
    assertUuid(ticketId, 'ticketId');
    return this.tickets.update(context, idempotencyKey ?? '', ticketId, parseUpdateTicket(body));
  }

  @Post(':ticketId/assignment')
  public async assign(
    @Param('ticketId') ticketId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const parsed = parseAssignment(body);
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'tickets.assign');
    assertUuid(ticketId, 'ticketId');
    return this.tickets.assign(context, idempotencyKey ?? '', ticketId, parsed.assigneeId);
  }

  @Post(':ticketId/resolution')
  public async resolution(
    @Param('ticketId') ticketId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const parsed = parseResolution(body);
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'tickets.close');
    assertUuid(ticketId, 'ticketId');
    return this.tickets.setResolution(context, idempotencyKey ?? '', ticketId, parsed.status);
  }

  @Post(':ticketId/sla-status')
  public async slaStatus(
    @Param('ticketId') ticketId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const parsed = parseSlaStatus(body);
    const context = await this.context(authorization, tenantId, correlationId);
    this.assertPermission(context.permissions, 'tickets.update');
    assertUuid(ticketId, 'ticketId');
    return this.tickets.setSlaStatus(context, idempotencyKey ?? '', ticketId, parsed.status);
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
    assertUuid(ticketId, 'ticketId');
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
  if (typeof parsed.title !== 'string' || !parsed.title.trim() || parsed.title.length > 500)
    throw new BadRequestException('Ticket title must contain at most 500 characters');
  if (parsed.customerId !== undefined) assertUuid(parsed.customerId, 'customerId');
  if (parsed.conversationId !== undefined) assertUuid(parsed.conversationId, 'conversationId');
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
  if (typeof parsed.body !== 'string' || !parsed.body.trim() || parsed.body.length > 20_000)
    throw new BadRequestException('Comment body must contain at most 20000 characters');
  const visibility = parsed.visibility ?? 'INTERNAL';
  if (typeof visibility !== 'string' || !['INTERNAL', 'CUSTOMER_VISIBLE'].includes(visibility))
    throw new BadRequestException('Invalid comment visibility');
  return {
    body: parsed.body.trim(),
    visibility: visibility as 'INTERNAL' | 'CUSTOMER_VISIBLE',
  };
}

function parseUpdateTicket(body: unknown): UpdateTicketInput {
  const parsed = parseJsonObject(body);
  const title = parsed.title;
  const priority = parsed.priority;
  const customerId = parsed.customerId;
  const conversationId = parsed.conversationId;
  if (
    title === undefined &&
    priority === undefined &&
    customerId === undefined &&
    conversationId === undefined
  )
    throw new BadRequestException('At least one ticket field is required');
  if (title !== undefined && (typeof title !== 'string' || !title.trim() || title.length > 500))
    throw new BadRequestException('Ticket title must contain at most 500 characters');
  if (
    priority !== undefined &&
    (typeof priority !== 'string' || !['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority))
  )
    throw new BadRequestException('Invalid ticket priority');
  if (customerId !== undefined && customerId !== null) assertUuid(customerId, 'customerId');
  if (conversationId !== undefined && conversationId !== null)
    assertUuid(conversationId, 'conversationId');
  return {
    ...(typeof title === 'string' ? { title: title.trim() } : {}),
    ...(typeof priority === 'string' ? { priority: priority as TicketPriority } : {}),
    ...(customerId === null || typeof customerId === 'string' ? { customerId } : {}),
    ...(conversationId === null || typeof conversationId === 'string' ? { conversationId } : {}),
  };
}

function parseAssignment(body: unknown): { assigneeId: string | null } {
  const assigneeId = parseJsonObject(body).assigneeId;
  if (assigneeId !== null) assertUuid(assigneeId, 'assigneeId');
  return { assigneeId };
}

function parseResolution(body: unknown): { status: TicketResolutionStatus } {
  const status = parseJsonObject(body).status;
  if (status !== 'OPEN' && status !== 'RESOLVED')
    throw new BadRequestException('Ticket status must be OPEN or RESOLVED');
  return { status };
}

function parseSlaStatus(body: unknown): { status: TicketSlaStatus } {
  const status = parseJsonObject(body).status;
  if (status !== 'OPEN' && status !== 'PENDING')
    throw new BadRequestException('Ticket SLA status must be OPEN or PENDING');
  return { status };
}

function parseSlaPolicy(body: unknown): TicketSlaPolicyInput {
  const parsed = parseJsonObject(body);
  if (typeof parsed.name !== 'string' || !parsed.name.trim() || parsed.name.length > 120)
    throw new BadRequestException('SLA policy name must contain at most 120 characters');
  const priority = parsed.priority;
  if (typeof priority !== 'string' || !['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority))
    throw new BadRequestException('Invalid SLA policy priority');
  const firstResponseMinutes = positiveWholeNumber(
    parsed.firstResponseMinutes,
    'firstResponseMinutes',
    10080,
  );
  const resolutionMinutes = positiveWholeNumber(
    parsed.resolutionMinutes,
    'resolutionMinutes',
    43200,
  );
  const escalationMinutes =
    parsed.escalationMinutes === undefined
      ? undefined
      : positiveWholeNumber(parsed.escalationMinutes, 'escalationMinutes', 43200);
  return {
    name: parsed.name.trim(),
    priority: priority as TicketPriority,
    firstResponseMinutes,
    resolutionMinutes,
    ...(escalationMinutes === undefined ? {} : { escalationMinutes }),
  };
}

function positiveWholeNumber(value: unknown, field: string, maximum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > maximum)
    throw new BadRequestException(
      `${field} must be a whole number between 1 and ${String(maximum)}`,
    );
  return value;
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

function assertUuid(value: unknown, field: string): asserts value is string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  )
    throw new BadRequestException(`${field} must be a UUID`);
}
