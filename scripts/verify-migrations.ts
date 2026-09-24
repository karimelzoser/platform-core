import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = resolve(fileURLToPath(new URL('.', import.meta.url)));
const migrationsDirectory = resolve(scriptsDirectory, '../migrations');
const immutableMigrations = [
  '0001_foundation.sql',
  '0002_authorization.sql',
  '0003_crm_customer360.sql',
] as const;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function main(): Promise<void> {
  const manifest = await readFile(resolve(migrationsDirectory, 'SHA256SUMS'), 'utf8');
  const expected = new Map(
    manifest
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => {
        const [digest, path] = line.trim().split(/\s+/u);
        if (!digest || !path) throw new Error(`Invalid SHA256SUMS entry: ${line}`);
        return [basename(path), digest] as const;
      }),
  );

  for (const name of immutableMigrations) {
    const checksum = sha256(await readFile(resolve(migrationsDirectory, name)));
    if (checksum !== expected.get(name)) {
      throw new Error(`Immutable migration checksum mismatch for ${name}`);
    }
  }

  console.log('Immutable migration checksums verified.');
}

void main();
