import { extraReviewSurfaces } from './review-surfaces-extra';
import { reviewSurfaces } from './review-surfaces';

export const allReviewSurfaces = {
  ...reviewSurfaces,
  ...extraReviewSurfaces,
};

export type AllReviewSurfaceKey = keyof typeof allReviewSurfaces;

export function isAllReviewSurface(value: string): value is AllReviewSurfaceKey {
  return value in allReviewSurfaces;
}
