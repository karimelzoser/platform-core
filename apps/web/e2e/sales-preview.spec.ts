import { expect, test, type Page, type TestInfo } from '@playwright/test';

const owner = requiredEnvironment('PREVIEW_E2E_OWNER_USERNAME');
const ownerPassword = requiredEnvironment('PREVIEW_E2E_OWNER_PASSWORD');
const previewOpportunityId = 'dddddddd-0000-0000-0000-000000000858';
const previewStoreId = 'dddddddd-0000-0000-0000-000000000001';
const previewWonOrderId = 'dddddddd-0000-0000-0000-000000000860';

test.describe.configure({ mode: 'serial' });

test.describe('Sales disposable development preview', () => {
  test('runs protected pipeline, task, win, responsive and RTL acceptance', async ({ browser }, testInfo) => {
    testInfo.setTimeout(180_000);
    requireDisposablePreview();
    const consoleErrors: string[] = [];
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    monitorBrowserErrors(page, consoleErrors);
    await login(page, owner, ownerPassword);

    await page.goto('/sales');
    await expect(page.getByRole('heading', { name: 'Pipeline & opportunities' })).toBeVisible();
    await expect(page.getByText('Preview sales pipeline')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Preview enterprise opportunity' })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();

    await page.goto(`/sales/${previewOpportunityId}`);
    await expect(page.getByRole('heading', { name: 'Preview enterprise opportunity' })).toBeVisible();
    await expect(page.getByText('Preview follow-up')).toBeVisible();
    await page.getByRole('button', { name: 'Complete' }).click();
    await expect(page.getByText('Sales activity completed.')).toBeVisible();
    await expect(page.getByText('COMPLETED')).toBeVisible();

    await page.getByLabel('Open stage').selectOption({ label: 'Proposal' });
    await page.getByRole('button', { name: 'Update stage' }).click();
    await expect(page.getByText('Opportunity stage updated.')).toBeVisible();
    await expect(page.getByText(/Preview sales pipeline \/ Proposal/)).toBeVisible();

    await page.getByLabel('Won stage').selectOption({ label: 'Won' });
    await page.getByLabel('Store ID').fill(previewStoreId);
    await page.getByLabel('Order ID').fill(previewWonOrderId);
    await page.getByRole('button', { name: 'Mark won' }).click();
    await expect(page.getByText('Opportunity closed.')).toBeVisible();
    await expect(page.getByText('WON', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: previewWonOrderId })).toBeVisible();

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
    throw new Error('PREVIEW_E2E=1 is required; this suite must run only against the disposable preview.');
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
    page.getByRole('alert').waitFor({ state: 'visible' }).then(async () => {
      const message = (await page.getByRole('alert').textContent()) ?? 'no error text';
      throw new Error(`Preview login failed: ${message}`);
    }),
  ]);
}

async function assertResponsiveAndRtl(page: Page, testInfo: TestInfo) {
  await page.goto('/sales');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.getByRole('heading', { name: 'Pipeline & opportunities' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Pipeline & opportunities' })).toBeVisible();
  await page.getByRole('button', { name: 'العربية · RTL' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  const screenshot = testInfo.outputPath('sales-mobile-rtl.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('sales-mobile-rtl', { path: screenshot, contentType: 'image/png' });
  await page.getByRole('button', { name: 'English · LTR' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
}
