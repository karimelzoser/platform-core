import assert from 'node:assert/strict';
import test from 'node:test';
import { allPreviewSurfaces } from './preview-registry';

const expectedSurfaces = [
  'inbox',
  'customers',
  'tickets',
  'orders',
  'confirmation',
  'shipping',
  'recovery',
  'returns',
  'sales',
  'campaigns',
  'automation',
  'operators',
  'approvals',
  'integrations',
  'knowledge',
  'analytics',
  'billing',
  'developer',
  'team',
  'settings',
  'onboarding',
  'organizations',
  'configuration',
  'simulation',
  'custom-data',
  'admin',
  'runtime',
] as const;

test('backend-independent review mode covers the full mapped product', () => {
  assert.equal(Object.keys(allPreviewSurfaces).length, 27);
  assert.deepEqual(Object.keys(allPreviewSurfaces).sort(), [...expectedSurfaces].sort());
});

test('every review surface explicitly marks all metrics as preview data', () => {
  for (const [key, surface] of Object.entries(allPreviewSurfaces)) {
    for (const metric of surface.metrics) {
      assert.match(
        metric.detail,
        /preview/i,
        `${key}/${metric.label} must not be mistaken for live tenant data`,
      );
    }
  }
});

test('every review surface has enough interaction content for visual review', () => {
  for (const [key, surface] of Object.entries(allPreviewSurfaces)) {
    assert.ok(surface.metrics.length >= 4, `${key} needs summary metrics`);
    assert.ok(surface.lanes.length >= 3, `${key} needs workflow lanes`);
    assert.ok(surface.rows.length >= 3, `${key} needs queue rows`);
    assert.ok(surface.insights.length >= 3, `${key} needs review insights`);
    assert.ok(surface.nextActions.length >= 3, `${key} needs simulated controls`);
  }
});
