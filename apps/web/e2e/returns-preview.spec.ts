import { expect, test, type Page, type TestInfo } from '@playwright/test';

const owner = requiredEnvironment('PREVIEW_E2E_OWNER_USERNAME');
const ownerPassword = requiredEnvironment('PREVIEW_E2E_OWNER_PASSWORD');
const returnOrderId = 'dddddddd-0000-0000-0000-000000000021';

test.describe.configure({ mode: 'serial' });

test.describe('Returns disposable development preview', () => {
  test('creates a protected return request and proves responsive RTL access', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(180_000);
    requireDisposablePreview();
    const consoleErrors: string[] = [];
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    monitorBrowserErrors(page, consoleErrors);

    await login(page, owner, ownerPassword);
    await page.goto('/returns');
    await expect(page.getByRole('heading', { name: 'Returns, exchanges & refunds' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create return' })).toBeVisible();

    await page.goto(`/returns/new?orderId=${returnOrderId}`);
    await expect(page.getByRole('heading', { name: 'Create return or exchange' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'RETURN-PREVIEW-1001' })).toBeVisible();
    await page.getByLabel('Resolution type').selectOption('RETURN');
    await page.getByLabel('Order line').selectOption('dddddddd-0000-0000-0000-000000000022');
    await page.getByLabel('Quantity').fill('1');
    await page.getByLabel('Reason code').fill('CUSTOMER_REQUEST');
    await page.getByLabel('Customer note').fill('Disposable preview return acceptance');
    await Promise.all([
      page.waitForURL(/\/returns\/[0-9a-f-]{36}/i),
      page.getByRole('button', { name: 'Create request' }).click(),
    ]);

    await expect(page.getByRole('heading', { name: 'Return request' })).toBeVisible();
    await expect(page.getByText('REQUESTED', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Disposable preview return acceptance')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Return lines' })).toBeVisible();

    await assertResponsiveAndRtl(page, testInfo);
    await context.close();
    expect(consoleErrors, `Unexpected browser errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the disposable preview E2E suite.`);
  return value;
}

function requireDisposablePreview() {
  if (process.env.PREVIEW_E2E !== '1')
    throw new Error(
      'PREVIEW_E2E=1 is required; this suite must run only against the disposable preview.',
    );
  const url = new URL(process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000');
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !isLoopbackHost(url.hostname))
    throw new Error('The disposable preview E2E suite accepts only a loopback base URL.');
}

function isLoopbackHost(hostname: string) {
  return hostname === '127.0.0.1' || hostname === 'localhost';
}

function monitorBrowserErrors(page: Page, errors: string[]) {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
}

async function login(page: Page, username: string, password: string) {
  await page.goto('/preview-login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await Promise.race([
    page.waitForURL(/\/customers$/, { waitUntil: 'domcontentloaded' }),
    page
      .getByRole('alert')
      .waitFor({ state: 'visible' })
      .then(async () => {
        const message = (await page.getByRole('alert').textContent()) ?? 'no error text';
        throw new Error(`Preview login failed: ${message}`);
      }),
  ]);
}

async function assertResponsiveAndRtl(page: Page, testInfo: TestInfo) {
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.getByRole('heading', { name: 'Return request' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.getByRole('button', { name: 'العربية · RTL' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  const screenshot = testInfo.outputPath('returns-mobile-rtl.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('returns-mobile-rtl', { path: screenshot, contentType: 'image/png' });
  await page.getByRole('button', { name: 'English · LTR' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
}
