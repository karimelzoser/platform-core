import { expect, test, type Page, type TestInfo } from '@playwright/test';

const owner = requiredEnvironment('PREVIEW_E2E_OWNER_USERNAME');
const ownerPassword = requiredEnvironment('PREVIEW_E2E_OWNER_PASSWORD');
const previewOrderId = 'dddddddd-0000-0000-0000-000000000002';

test.describe.configure({ mode: 'serial' });

test.describe('Orders disposable development preview', () => {
  test('runs canonical order workflow and responsive RTL acceptance', async ({ browser }, testInfo) => {
    testInfo.setTimeout(180_000);
    requireDisposablePreview();
    const consoleErrors: string[] = [];
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    monitorBrowserErrors(page, consoleErrors);

    await login(page);
    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible();
    await expect(page.getByText('Preview Commerce Store', { exact: true }).first()).toBeVisible();
    const orderRow = page.getByRole('link').filter({ hasText: 'PREVIEW-1001' });
    await expect(orderRow).toContainText('PENDING');
    await orderRow.click();
    await expect(page).toHaveURL(new RegExp(`/orders/${previewOrderId}$`));
    await expect(page.getByRole('heading', { name: 'PREVIEW-1001', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Customer confirmation' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Duplicate protection' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Order changes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Protected cancellation' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'External commerce execution' })).toBeVisible();

    await page.getByRole('button', { name: 'Scan previous 5 days' }).click();
    await expect(page.getByRole('status')).toContainText('Operation accepted');
    await page.reload();
    await expect(workflowMetric(page, 'Duplicates')).toContainText('UNIQUE');

    await page.getByRole('button', { name: 'Request confirmation' }).click();
    await expect(page.getByRole('status')).toContainText('Operation accepted');
    await page.reload();
    await expect(workflowMetric(page, 'Confirmation')).toContainText('REQUESTED');

    await page.getByRole('button', { name: 'Mark confirmed' }).click();
    await expect(page.getByRole('status')).toContainText('Operation accepted');
    await page.reload();
    await expect(page.locator('.order-status-stack')).toContainText('CONFIRMED');
    await expect(workflowMetric(page, 'Confirmation')).toContainText('CONFIRMED');

    const modification = page.getByRole('heading', { name: 'Order changes' }).locator('..').locator('..');
    await modification.getByLabel('Internal/order note').fill('Browser acceptance modification');
    await modification.getByLabel('Reason').fill('Verify guarded canonical modification flow');
    await modification.getByRole('button', { name: 'Request modification' }).click();
    await expect(modification.getByRole('status')).toContainText('Operation accepted');
    await page.reload();
    await expect(workflowMetric(page, 'Modification')).toContainText('REQUESTED');

    const pendingModification = page
      .getByRole('heading', { name: 'Order changes' })
      .locator('..')
      .locator('..')
      .getByRole('listitem')
      .filter({ hasText: 'Verify guarded canonical modification flow' });
    await pendingModification.getByRole('button', { name: 'Approve' }).click();
    await expect(pendingModification.getByRole('status')).toContainText('Operation accepted');
    await page.reload();
    await expect(workflowMetric(page, 'Modification')).toContainText('APPLIED');
    await expect(workflowMetric(page, 'Provider sync')).toContainText('PENDING');

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

function workflowMetric(page: Page, label: string) {
  return page.locator('.order-workflow-overview .order-summary-metric').filter({ hasText: label });
}

async function assertResponsiveAndRtl(page: Page, testInfo: TestInfo) {
  await page.goto('/orders');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('link').filter({ hasText: 'PREVIEW-1001' })).toBeVisible();
  await page.getByRole('button', { name: 'العربية · RTL' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  const screenshot = testInfo.outputPath('orders-mobile-rtl.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('orders-mobile-rtl', { path: screenshot, contentType: 'image/png' });
  await page.getByRole('button', { name: 'English · LTR' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
}
