import assert from 'node:assert/strict';
import test from 'node:test';
import { productModules } from './product-catalog';
import { allPreviewSurfaces } from './preview-registry';

test('backend-independent review mode covers the full typed product catalog', () => {
  const catalogSlugs = productModules.map((module) => module.slug).sort();
  const reviewSlugs = Object.keys(allPreviewSurfaces).sort();
  assert.equal(reviewSlugs.length, productModules.length);
  assert.deepEqual(reviewSlugs, catalogSlugs);
});

test('product catalog has no duplicate route slugs', () => {
  const slugs = productModules.map((module) => module.slug);
  assert.equal(new Set(slugs).size, slugs.length);
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
