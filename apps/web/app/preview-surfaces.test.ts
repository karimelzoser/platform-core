import assert from 'node:assert/strict';
import test from 'node:test';
import { platformPreviewSurfaces } from './preview-platform-surfaces';
import { previewSurfaces, type PreviewSurface } from './preview-surfaces';

const surfaces: Record<string, PreviewSurface> = {
  ...previewSurfaces,
  ...platformPreviewSurfaces,
};

const expectedPreviewKeys = [
  'confirmation',
  'sales',
  'campaigns',
  'automation',
  'operators',
  'knowledge',
  'analytics',
  'billing',
  'developer',
  'settings',
  'configuration',
  'simulation',
  'custom-data',
  'admin',
  'runtime',
] as const;

test('preview registry covers every backend-independent workspace', () => {
  assert.deepEqual(Object.keys(surfaces).sort(), [...expectedPreviewKeys].sort());
});

test('every preview workspace has a complete review contract', () => {
  for (const [key, surface] of Object.entries(surfaces)) {
    assert.ok(surface.label.trim(), `${key} needs a label`);
    assert.ok(surface.eyebrow.trim(), `${key} needs an eyebrow`);
    assert.ok(surface.description.length >= 40, `${key} description is too shallow`);
    assert.equal(surface.metrics.length, 4, `${key} should expose four summary metrics`);
    assert.ok(surface.lanes.length >= 3, `${key} should expose at least three workflow lanes`);
    assert.ok(surface.rows.length >= 3, `${key} should expose at least three queue rows`);
    assert.ok(surface.insights.length >= 3, `${key} should expose at least three review insights`);
    assert.ok(surface.nextActions.length >= 3, `${key} should expose at least three controls`);

    for (const metric of surface.metrics) {
      assert.ok(metric.label.trim(), `${key} has an unlabeled metric`);
      assert.ok(metric.value.trim(), `${key} has an empty metric value`);
      assert.match(
        metric.detail,
        /preview/i,
        `${key}/${metric.label} must clearly identify non-live sample data`,
      );
    }

    for (const lane of surface.lanes) {
      assert.ok(lane.title.trim(), `${key} has an untitled lane`);
      assert.ok(lane.items.length > 0, `${key}/${lane.title} has no review items`);
    }

    for (const row of surface.rows) {
      assert.ok(row.primary.trim(), `${key} has a queue row without an identifier`);
      assert.ok(row.secondary.trim(), `${key}/${row.primary} has no context`);
      assert.ok(row.status.trim(), `${key}/${row.primary} has no status`);
      assert.ok(row.meta.trim(), `${key}/${row.primary} has no detail metadata`);
    }
  }
});

test('preview data never presents itself as a live backend result', () => {
  for (const [key, surface] of Object.entries(surfaces)) {
    const metricDetails = surface.metrics.map((metric) => metric.detail.toLowerCase());
    assert.ok(
      metricDetails.every((detail) => detail.includes('preview')),
      `${key} contains a metric that is not labeled as preview data`,
    );
  }
});
