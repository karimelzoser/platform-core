import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers as NestHeaders,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  correlationId,
  parseWebhookJson,
  WebhookIngressService,
} from './webhook-ingress.service.js';

const maximumWebhookBytes = 1_048_576;

@Controller('v1/webhooks')
export class WebhookController {
  public constructor(private readonly ingress: WebhookIngressService) {}

  @Post(':connectorKey/:connectionId')
  @HttpCode(HttpStatus.ACCEPTED)
  public async receive(
    @Param('connectorKey') connectorKey: string,
    @Param('connectionId') connectionId: string,
    @NestHeaders() requestHeaders: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ): Promise<{ deliveryId: string; duplicate: boolean }> {
    if (!Buffer.isBuffer(body)) throw new BadRequestException('Webhook body must be raw JSON');
    if (body.byteLength > maximumWebhookBytes)
      throw new PayloadTooLargeException('Webhook body too large');
    let payload: Record<string, unknown>;
    try {
      payload = parseWebhookJson(body);
    } catch {
      throw new BadRequestException('Malformed webhook JSON');
    }
    const headers = new Headers(
      Object.entries(requestHeaders)
        .filter(([, value]) => value !== undefined)
        .map(([name, value]) => [name, Array.isArray(value) ? value.join(',') : (value ?? '')]),
    );
    const outcome = await this.ingress.ingest({
      connectorKey,
      connectionId,
      headers,
      rawBody: body,
      payload,
      correlationId: correlationId(headers.get('x-correlation-id') ?? undefined),
    });
    if (outcome.kind === 'unknown_connector' || outcome.kind === 'unknown_connection') {
      throw new NotFoundException('Unknown integration');
    }
    if (outcome.kind === 'disabled_connection')
      throw new ForbiddenException('Integration is disabled');
    if (outcome.kind === 'invalid_signature')
      throw new UnauthorizedException('Invalid webhook signature');
    return { deliveryId: outcome.deliveryId, duplicate: outcome.kind === 'duplicate' };
  }
}
