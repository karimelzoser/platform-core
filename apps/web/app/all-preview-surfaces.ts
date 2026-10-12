import { extraPreviewSurfaces } from './preview-surfaces-extra';
import { previewSurfaces } from './preview-surfaces';

export const allPreviewSurfaces = {
  ...previewSurfaces,
  ...extraPreviewSurfaces,
};

export type AllPreviewSurfaceKey = keyof typeof allPreviewSurfaces;

export function isAllPreviewSurface(value: string): value is AllPreviewSurfaceKey {
  return value in allPreviewSurfaces;
}
