import { expect, test, type Page, type TestInfo } from '@playwright/test';

const owner = requiredEnvironment('PREVIEW_E2E_OWNER_USERNAME');
const ownerPassword = requiredEnvironment('PREVIEW_E2E_OWNER_PASSWORD');
const previewShipmentId = 'eeeeeeee-0000-0000-0000-000000000004';

test.describe.configure({ mode: 'serial' });

test.describe('Shipping disposable development preview', () => {
  test('runs delivery rescue and responsive RTL acceptance', async ({ browser }, testInfo) => {
    testInfo.setTimeout(180_000);
    requireDisposablePreview();
    const consoleErrors: string[] = [];
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    monitorBrowserErrors(page, consoleErrors);

    await login(page);
    await page.goto('/shipping');
    await expect(
      page.getByRole('heading', { name: 'Shipping operations', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('DEV-PREVIEW-1001', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('PREVIEW-1001', { exact: true }).first()).toBeVisible();
    const shipmentRow = page.getByRole('link').filter({ hasText: 'DEV-PREVIEW-1001' });
    await expect(shipmentRow).toContainText('EXCEPTION');
    await shipmentRow.click();

    await expect(page).toHaveURL(new RegExp(`/shipping/${previewShipmentId}$`));
    await expect(
      page.getByRole('heading', { name: 'DEV-PREVIEW-1001', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Normalized carrier timeline' })).toBeVisible();
    await expect(page.getByText('DELIVERY_FAILED', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Exception operations' })).toBeVisible();

    const markContacted = page.getByRole('button', { name: 'Mark buyer contacted' });
    if (await markContacted.isVisible().catch(() => false)) {
      await markContacted.click();
      await expect(page.getByText('CONTACTED', { exact: true })).toBeVisible();
    }

    const resolve = page.getByRole('button', { name: 'Resolve rescue case' });
    if (await resolve.isVisible().catch(() => false)) {
      await resolve.click();
    }
    await expect(page.getByText('RESOLVED', { exact: true })).toBeVisible();

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

async function login(page: Page) {
  await page.goto('/preview-login');
  await page.getByLabel('Username').fill(owner);
  await page.getByLabel('Password').fill(ownerPassword);
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
  await page.goto('/shipping');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(
    page.getByRole('heading', { name: 'Shipping operations', exact: true }),
  ).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await assertShippingTableFits(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('DEV-PREVIEW-1001', { exact: true }).first()).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await assertShippingTableFits(page);
  await page.getByRole('button', { name: 'العربية · RTL' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await assertNoHorizontalOverflow(page);
  await assertShippingTableFits(page);
  const screenshot = testInfo.outputPath('shipping-mobile-rtl.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('shipping-mobile-rtl', { path: screenshot, contentType: 'image/png' });
  await page.getByRole('button', { name: 'English · LTR' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
}

async function assertNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

async function assertShippingTableFits(page: Page) {
  const table = page.getByRole('table', { name: 'Shipments' });
  await expect(table).toBeVisible();
  await expect
    .poll(() => table.evaluate((element) => element.scrollWidth <= element.clientWidth))
    .toBe(true);
}
