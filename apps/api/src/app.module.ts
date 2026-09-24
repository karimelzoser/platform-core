import { Controller, Get, Module } from '@nestjs/common';
import { SessionController } from './session.controller.js';

@Controller('health')
class HealthController {
  @Get()
  public health(): { status: 'ok'; service: 'api' } {
    return { status: 'ok', service: 'api' };
  }
}

@Module({ controllers: [HealthController, SessionController] })
// A Nest module is a declarative boundary; it intentionally has no members.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AppModule {}
