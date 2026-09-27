import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedContextService } from './authenticated-context.service.js';
import { MediaService } from './media.service.js';

@Controller('v1/media')
export class MediaController {
  public constructor(
    private readonly authentication: AuthenticatedContextService,
    private readonly media: MediaService,
  ) {}

  @Post()
  public async upload(
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    if (!Buffer.isBuffer(body)) throw new BadRequestException('Media body must be JSON');
    const parsed = this.json(body);
    if (
      typeof parsed.mediaType !== 'string' ||
      typeof parsed.contentType !== 'string' ||
      typeof parsed.fileName !== 'string' ||
      typeof parsed.bytesBase64 !== 'string' ||
      !['IMAGE', 'DOCUMENT', 'AUDIO', 'VIDEO'].includes(parsed.mediaType) ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(parsed.bytesBase64)
    )
      throw new BadRequestException('Invalid media payload');
    const bytes = Buffer.from(parsed.bytesBase64, 'base64');
    if (!bytes.byteLength || bytes.byteLength > 700_000)
      throw new BadRequestException('Development media is limited to 700,000 bytes');
    const context = await this.context(authorization, tenantId, correlationId);
    return this.media.registerLocalBytes(context, {
      mediaType: parsed.mediaType as 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'VIDEO',
      contentType: parsed.contentType,
      fileName: parsed.fileName,
      bytes,
    });
  }

  private json(body: Buffer): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(body.toString('utf8'));
      if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
      return parsed as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Media body must be a JSON object');
    }
  }

  private async context(
    authorization: string | undefined,
    tenantId: string | undefined,
    correlationId: string | undefined,
  ) {
    try {
      const context = await this.authentication.resolve({ authorization, tenantId, correlationId });
      if (!context.permissions.includes('messaging.conversations.reply'))
        throw new ForbiddenException('Conversation reply permission is required');
      return context;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException('Invalid authentication or tenant membership');
    }
  }
}
