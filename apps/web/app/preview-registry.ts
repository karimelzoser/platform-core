import { livePreviewSurfaces } from './preview-live-surfaces';
import { platformPreviewSurfaces } from './preview-platform-surfaces';
import { previewSurfaces, type PreviewSurface } from './preview-surfaces';

export const allPreviewSurfaces = {
  ...livePreviewSurfaces,
  ...previewSurfaces,
  ...platformPreviewSurfaces,
} as const satisfies Record<string, PreviewSurface>;

export type ReviewSurfaceKey = keyof typeof allPreviewSurfaces;

export function isReviewSurface(value: string): value is ReviewSurfaceKey {
  return value in allPreviewSurfaces;
}

export function reviewSurface(value: string): PreviewSurface | undefined {
  return isReviewSurface(value) ? allPreviewSurfaces[value] : undefined;
}
