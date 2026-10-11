import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '../..');

test('the cached API image install sees every transitive workspace manifest', () => {
  const dockerfile = readFileSync(resolve(root, 'docker/Dockerfile.api'), 'utf8');
  const installAt = dockerfile.indexOf('RUN pnpm install --frozen-lockfile');
  assert.ok(installAt >= 0);
  const beforeInstall = dockerfile.slice(0, installAt);
  const manifests = new Map();
  for (const directory of readdirSync(resolve(root, 'packages'))) {
    const relative = `packages/${directory}/package.json`;
    const manifest = JSON.parse(readFileSync(resolve(root, relative), 'utf8'));
    manifests.set(manifest.name, { relative, manifest });
  }
  const api = JSON.parse(readFileSync(resolve(root, 'apps/api/package.json'), 'utf8'));
  const dependencies = Object.keys(api.dependencies);
  const seen = new Set();
  while (dependencies.length > 0) {
    const name = dependencies.pop();
    if (!name?.startsWith('@platform/') || seen.has(name)) continue;
    seen.add(name);
    const workspace = manifests.get(name);
    assert.ok(workspace, `Workspace dependency ${name} has no manifest`);
    assert.ok(
      beforeInstall.includes(`COPY ${workspace.relative} ${workspace.relative}`),
      `API image must copy ${workspace.relative} before its cached install`,
    );
    dependencies.push(...Object.keys(workspace.manifest.dependencies ?? {}));
  }
});

test('unreleased Recovery migration reuses the historical tenant-qualified message key', () => {
  const media = readFileSync(
    resolve(root, 'migrations/0018_messaging_media_references.sql'),
    'utf8',
  );
  const recovery = readFileSync(resolve(root, 'migrations/0043_recovery.sql'), 'utf8');
  assert.match(
    media,
    /ADD CONSTRAINT messaging_messages_tenant_id_id_key UNIQUE \(tenant_id, id\)/u,
  );
  assert.doesNotMatch(recovery, /ADD CONSTRAINT messaging_messages_tenant_id_id_key/u);
  assert.match(recovery, /REFERENCES messaging\.messages\(tenant_id, id\)/u);
});
