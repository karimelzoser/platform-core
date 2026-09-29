import { expect, test, type Page, type TestInfo } from '@playwright/test';

const owner = requiredEnvironment('PREVIEW_E2E_OWNER_USERNAME');
const ownerPassword = requiredEnvironment('PREVIEW_E2E_OWNER_PASSWORD');
const approver = requiredEnvironment('PREVIEW_E2E_APPROVER_USERNAME');
const approverPassword = requiredEnvironment('PREVIEW_E2E_APPROVER_PASSWORD');
const previewTagId = requiredEnvironment('PREVIEW_E2E_TAG_ID');

test.describe.configure({ mode: 'serial' });

test.describe('CRM disposable development preview', () => {
  test('runs protected customer lifecycle, approval, accessibility, responsive, and RTL checks', async ({
    browser,
  }, testInfo) => {
    // The disposable preview starts Next in development mode. First visits to
    // distinct protected routes compile their route modules, so this complete
    // multi-route acceptance journey needs more than Playwright's short
    // default without weakening any individual assertion.
    testInfo.setTimeout(180_000);
    requireDisposablePreview();
    const consoleErrors: string[] = [];
    const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const ownerPage = await ownerContext.newPage();
    monitorBrowserErrors(ownerPage, consoleErrors);

    await login(ownerPage, owner, ownerPassword);
    await expect(ownerPage.getByRole('heading', { name: 'Customers', exact: true })).toBeVisible();
    await expect(ownerPage.getByRole('link', { name: 'Create customer' })).toBeVisible();
    await ownerPage.keyboard.press('Tab');
    await expect(ownerPage.locator(':focus')).toBeVisible();

    const stamp = Date.now().toString(36);
    const sourceId = await createCustomer(
      ownerPage,
      `CRM E2E source ${stamp}`,
      `source-${stamp}@example.test`,
    );
    const targetId = await createCustomer(
      ownerPage,
      `CRM E2E target ${stamp}`,
      `target-${stamp}@example.test`,
    );

    await ownerPage.goto('/customers/import');
    await ownerPage.getByLabel('CSV file').setInputFiles({
      name: 'quoted-customers.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        [
          'display_name,first_name,last_name,company_name,email,phone',
          `"Quoted, customer",Quoted,Customer,"Example, Incorporated",quoted-${stamp}@example.test,`,
          `"Line break customer",Line,Break,"First line\nSecond line",line-break-${stamp}@example.test,`,
        ].join('\n'),
      ),
    });
    await ownerPage.getByRole('button', { name: 'Import CSV' }).click();
    await expect(ownerPage.getByText('Imported 2 customer(s).', { exact: true })).toBeVisible();

    await ownerPage.goto('/segments');
    const dynamicSegment = ownerPage
      .getByRole('heading', { name: 'Create dynamic segment' })
      .locator('..');
    await dynamicSegment.getByLabel('Segment name').fill(`E2E dynamic ${stamp}`);
    await dynamicSegment.getByLabel('Required tag IDs (comma separated)').fill(previewTagId);
    await dynamicSegment.getByRole('button', { name: 'Create dynamic segment' }).click();
    await expect(dynamicSegment.getByRole('status')).toHaveText(
      'Dynamic segment created. Use its evaluation control below to update rule members.',
    );
    await ownerPage.reload();
    const segmentRow = ownerPage.getByRole('listitem').filter({ hasText: `E2E dynamic ${stamp}` });
    await segmentRow.getByRole('button', { name: 'Evaluate tag rule' }).click();
    await expect(segmentRow.getByRole('status')).toContainText('Rule evaluated:');

    await ownerPage.goto(`/customers/${sourceId}/merge/${targetId}`);
    await ownerPage.getByLabel('Merge reason').fill('Disposable preview browser acceptance check');
    await ownerPage.getByRole('button', { name: 'Request merge approval' }).click();
    await expect(
      ownerPage.locator('p.merge-success').filter({ hasText: 'Approval request submitted:' }),
    ).toBeVisible();

    const approverContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const approverPage = await approverContext.newPage();
    monitorBrowserErrors(approverPage, consoleErrors);
    await login(approverPage, approver, approverPassword);
    await approverPage.goto('/approvals');
    const approvalItem = approverPage
      .getByRole('listitem')
      .filter({ hasText: 'crm.customer.merge' })
      .filter({ hasText: sourceId });
    await approvalItem.getByRole('button', { name: 'Approve' }).click();
    await expect(approvalItem).toContainText('APPROVED');
    await approverContext.close();

    await ownerPage.goto('/approvals');
    const approvedMerge = ownerPage
      .getByRole('listitem')
      .filter({ hasText: 'crm.customer.merge' })
      .filter({ hasText: sourceId });
    await approvedMerge.getByRole('button', { name: 'Execute approved merge' }).click();
    await expect(approvedMerge.getByRole('status')).toHaveText('Merge completed.');

    await assertResponsiveAndRtl(ownerPage, testInfo);
    await ownerContext.close();
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

async function createCustomer(page: Page, displayName: string, email: string): Promise<string> {
  await page.goto('/customers/new');
  await page.getByLabel('Display name').fill(displayName);
  await page.getByLabel('Email').fill(email);
  await Promise.all([
    page.waitForURL(/\/customers\/[0-9a-f-]{36}$/),
    page.getByRole('button', { name: 'Create customer' }).click(),
  ]);
  const customerId = page.url().match(/\/customers\/([0-9a-f-]{36})$/i)?.[1];
  if (!customerId) throw new Error('Customer creation did not redirect to a customer detail URL.');
  await expect(page.getByRole('heading', { name: displayName })).toBeVisible();
  return customerId;
}

async function assertResponsiveAndRtl(page: Page, testInfo: TestInfo) {
  await page.goto('/customers');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(page.getByRole('heading', { name: 'Customers', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.getByRole('search')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.customer-table thead')).toHaveCSS('display', 'none');
  await page.getByRole('button', { name: 'العربية · RTL' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await page.getByRole('button', { name: 'English · LTR' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  const screenshot = testInfo.outputPath('crm-mobile-rtl-ltr.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('crm-mobile-rtl-ltr', { path: screenshot, contentType: 'image/png' });
}
