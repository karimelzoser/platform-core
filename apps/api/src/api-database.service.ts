import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createDatabase, destroyDatabase, type PlatformDatabase } from '@platform/database';
import { loadApiConfig } from './config.js';

@Injectable()
export class ApiDatabaseService implements OnModuleDestroy {
  public readonly database: PlatformDatabase = createDatabase(loadApiConfig().DATABASE_URL);

  public async onModuleDestroy(): Promise<void> {
    await destroyDatabase(this.database);
  }
}
