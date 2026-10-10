import { expect, test, type Page, type TestInfo } from '@playwright/test';

const owner = requiredEnvironment('PREVIEW_E2E_OWNER_USERNAME');
const ownerPassword = requiredEnvironment('PREVIEW_E2E_OWNER_PASSWORD');
const approver = requiredEnvironment('PREVIEW_E2E_APPROVER_USERNAME');
const approverPassword = requiredEnvironment('PREVIEW_E2E_APPROVER_PASSWORD');
const previewReturnOrderId = 'eeeeeeee-0000-0000-0000-000000000005';

test.describe.configure({ mode: 'serial' });

test.describe('Returns disposable development preview', () => {
  test('runs protected return, inspection, refund, and resolution workflow', async ({ browser }, testInfo) => {
    testInfo.setTimeout(180_000);
    requireDisposablePreview();
    const consoleErrors: string[] = [];
    const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const ownerPage = await ownerContext.newPage();
    monitorBrowserErrors(ownerPage, consoleErrors);
    await login(ownerPage, owner, ownerPassword);

    await ownerPage.goto(`/returns/new?orderId=${previewReturnOrderId}`);
    await expect(ownerPage.getByRole('heading', { name: 'Start a return' })).toBeVisible();
    await expect(ownerPage.getByText('PREVIEW-RETURN-1001')).toBeVisible();
    await expect(ownerPage.getByText('Eligible', { exact: true })).toBeVisible();
    const returnLine = ownerPage.locator('article.identity-role-card').filter({
      hasText: 'Preview return product',
    });
    await returnLine.getByRole('checkbox').check();
    await returnLine.getByLabel('Quantity').fill('1');
    await returnLine.getByLabel('Resolution').selectOption('REFUND');
    await returnLine.getByLabel('Proposed value (minor units)').fill('125000');
    await ownerPage.getByLabel('Case reason').selectOption('DEFECTIVE');
    await ownerPage.getByLabel('Customer note').fill('Protected browser returns acceptance.');
    await Promise.all([
      ownerPage.waitForURL(/\/returns\/[0-9a-f-]{36}\?message=/i),
      ownerPage.getByRole('button', { name: 'Create return request' }).click(),
    ]);
    const returnId = ownerPage.url().match(/\/returns\/([0-9a-f-]{36})/i)?.[1];
    if (!returnId) throw new Error('Return creation did not redirect to a return case URL.');
    await expect(ownerPage.getByText('REQUESTED', { exact: true }).first()).toBeVisible();

    const approveDecisionForm = ownerPage
      .getByRole('button', { name: 'Request approve approval' })
      .locator('form');
    await approveDecisionForm.getByLabel('Reason').fill('Browser acceptance eligible return');
    await approveDecisionForm.getByRole('button', { name: 'Request approve approval' }).click();
    await expect(ownerPage.getByRole('status')).toContainText('Approval requested:');

    await approveLatest(browser, returnId, 'returns.request.decide', consoleErrors);
    await ownerPage.reload();
    await ownerPage.getByRole('button', { name: 'Execute approve' }).click();
    await expect(ownerPage.getByText('APPROVED', { exact: true }).first()).toBeVisible();

    await ownerPage.getByRole('button', { name: 'Mark return received' }).click();
    await expect(ownerPage.getByText('RECEIVED', { exact: true }).first()).toBeVisible();
    const inspection = ownerPage.getByRole('heading', { name: 'Record physical inspection' }).locator('..');
    await inspection.getByLabel('Accepted quantity').fill('1');
    await inspection.getByLabel('Rejected quantity').fill('0');
    await inspection.getByLabel('Condition').selectOption('DEFECTIVE');
    await inspection.getByLabel('Inspection note').fill('Accepted during protected browser acceptance.');
    await inspection.getByRole('button', { name: 'Complete inspection' }).click();
    await expect(ownerPage.getByText('INSPECTED', { exact: true }).first()).toBeVisible();

    const refund = ownerPage.getByRole('heading', { name: 'Financial resolution' }).locator('..');
    await refund.getByLabel('Amount (minor units)').fill('125000');
    await refund.getByLabel('Reason').fill('Accepted return refund');
    await refund.getByRole('button', { name: 'Request refund approval' }).click();
    await expect(ownerPage.getByRole('status')).toContainText('Approval requested:');

    await approveLatest(browser, returnId, 'returns.refund.issue', consoleErrors);
    await ownerPage.reload();
    await ownerPage.getByRole('button', { name: 'Execute approved refund' }).click();
    await expect(ownerPage.getByText('Refund recorded and provider action queued when available.')).toBeVisible();

    await ownerPage.getByRole('button', { name: 'Validate and resolve case' }).click();
    await expect(ownerPage.getByText('RESOLVED', { exact: true }).first()).toBeVisible();
    await expect(ownerPage.getByText('returns.request.resolved')).toBeVisible();

    await assertResponsiveAndRtl(ownerPage, testInfo);
    await ownerContext.close();
    expect(consoleErrors, `Unexpected browser errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});

async function approveLatest(
  browser: Parameters<Parameters<typeof test>[1]>[0]['browser'],
  returnId: string,
  action: string,
  consoleErrors: string[],
) {
  const approverContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await approverContext.newPage();
  monitorBrowserErrors(page, consoleErrors);
  await login(page, approver, approverPassword);
  await page.goto('/approvals');
  const approval = page
    .getByRole('listitem')
    .filter({ hasText: action })
    .filter({ hasText: returnId })
    .filter({ hasText: 'REQUESTED' })
    .first();
  await expect(approval).toBeVisible();
  await approval.getByRole('button', { name: 'Approve' }).click();
  await expect(approval).toContainText('APPROVED');
  await approverContext.close();
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the disposable preview E2E suite.`);
  return value;
}

function requireDisposablePreview() {
  if (process.env.PREVIEW_E2E !== '1') {
    throw new Error('PREVIEW_E2E=1 is required; this suite must run only against the disposable preview.');
  }
  const url = new URL(process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000');
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !isLoopbackHost(url.hostname)) {
    throw new Error('The disposable preview E2E suite accepts only a loopback base URL.');
  }
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
  await page.goto('/returns');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.getByRole('heading', { name: 'Returns, exchanges & refunds' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.identity-table thead')).toHaveCSS('display', 'none');
  await page.getByRole('button', { name: 'العربية · RTL' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await page.getByRole('button', { name: 'English · LTR' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  const screenshot = testInfo.outputPath('returns-mobile-rtl-ltr.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('returns-mobile-rtl-ltr', { path: screenshot, contentType: 'image/png' });
}
