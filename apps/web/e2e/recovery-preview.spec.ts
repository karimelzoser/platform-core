import { expect, test, type Page, type TestInfo } from '@playwright/test';

const owner = requiredEnvironment('PREVIEW_E2E_OWNER_USERNAME');
const ownerPassword = requiredEnvironment('PREVIEW_E2E_OWNER_PASSWORD');
const recoveryOrderId = 'dddddddd-0000-0000-0000-000000000032';

test.describe.configure({ mode: 'serial' });

test.describe('Recovery disposable development preview', () => {
  test('runs canonical recovery detection, consent-aware dispatch, and responsive RTL acceptance', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(180_000);
    requireDisposablePreview();
    const consoleErrors: string[] = [];
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    monitorBrowserErrors(page, consoleErrors);

    await login(page);
    await page.goto('/recovery');
    await expect(
      page.getByRole('heading', { name: 'Abandoned-order recovery', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Preview recovery policy', { exact: false })).toBeVisible();

    await page.getByLabel('Draft / pending order ID').fill(recoveryOrderId);
    await page.getByRole('button', { name: 'Detect opportunity' }).click();
    await expect(page).toHaveURL(/\/recovery\/[0-9a-f-]{36}/u);
    await expect(page.getByRole('heading', { name: 'RECOVERY-PREVIEW-1001' })).toBeVisible();
    await expect(page.getByText('WHATSAPP · OPTED_IN', { exact: false })).toBeVisible();
    await expect(
      page.getByText('1 dispatchable customer conversation(s) are available.'),
    ).toBeVisible();

    // EmptyState renders its title as strong text inside a status region, not
    // as a heading. Wait for the actual empty/history state before branching.
    const noAttempts = page.getByText('No recovery attempts', { exact: true });
    const history = page.getByRole('table', { name: 'Recovery outreach history' });
    await expect(noAttempts.or(history)).toBeVisible();
    if (await noAttempts.isVisible()) {
      await page.getByLabel('Conversation').selectOption({ index: 1 });
      await page.getByLabel('Channel').selectOption('WHATSAPP');
      await page
        .getByLabel('Message body')
        .fill('Disposable preview recovery message through canonical Messaging.');
      await page.getByRole('button', { name: 'Queue recovery outreach' }).click();
      await expect(
        page.getByRole('status').filter({ hasText: 'Recovery message queued through Messaging.' }),
      ).toContainText('Recovery message queued through Messaging.');
    }
    await expect(page.getByRole('heading', { name: 'Outreach history' })).toBeVisible();
    await expect(history.getByRole('cell', { name: 'WHATSAPP', exact: true })).toBeVisible();
    await expect(history.getByRole('cell', { name: /^(QUEUED|SENT|DELIVERED)$/u })).toBeVisible();

    await assertMetricColumns(page, 4);

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
    page.waitForURL(/\/customers$/u, { waitUntil: 'domcontentloaded' }),
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
  await page.goto('/recovery');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.getByRole('heading', { name: 'Abandoned-order recovery' })).toBeVisible();
  await assertMetricColumns(page, 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Recovery opportunities' })).toBeVisible();
  await assertMetricColumns(page, 1);
  await page.getByRole('button', { name: 'العربية · RTL' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await assertMetricColumns(page, 1);
  const screenshot = testInfo.outputPath('recovery-mobile-rtl.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('recovery-mobile-rtl', { path: screenshot, contentType: 'image/png' });
  await page.getByRole('button', { name: 'English · LTR' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
}

async function assertMetricColumns(page: Page, columns: number) {
  const grid = page.locator('.ds-metric-grid');
  await expect(grid).toHaveCSS('display', 'grid');
  const tops = await grid
    .locator(':scope > .ds-metric')
    .evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().top)));
  expect(tops).toHaveLength(4);
  expect(new Set(tops).size).toBe(Math.ceil(4 / columns));
}
