import { cookies } from 'next/headers';

export async function GET(): Promise<Response> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl) {
    return new Response('Sign in and select an organization before exporting customers.', {
      status: 401,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  try {
    const response = await fetch(new URL('/v1/customers/export.csv', baseUrl), {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
    });
    const content = await response.text();
    if (!response.ok) {
      return new Response('Customer export is unavailable or not permitted.', {
        status: response.status,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    return new Response(content, {
      headers: {
        'content-disposition': 'attachment; filename="customers.csv"',
        'content-type': 'text/csv; charset=utf-8',
      },
    });
  } catch {
    return new Response('Customer export API is unavailable.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}
