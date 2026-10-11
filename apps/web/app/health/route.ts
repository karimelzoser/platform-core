import { NextResponse } from 'next/server';

export function GET() {
  const buildSha =
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.PLATFORM_BUILD_SHA ??
    process.env.GITHUB_SHA ??
    'unknown';
  return NextResponse.json({
    status: 'ok',
    service: 'web',
    buildSha,
    environment: process.env.APP_ENV ?? 'unknown',
  });
}
