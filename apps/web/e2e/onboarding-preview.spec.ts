import { expect, test, type Page, type TestInfo } from '@playwright/test';

const owner = requiredEnvironment('PREVIEW_E2E_OWNER_USERNAME');
const ownerPassword = requiredEnvironment('PREVIEW_E2E_OWNER_PASSWORD');

test.describe.configure({ mode: 'serial' });

test.describe('Self-service onboarding disposable preview', () => {
  test('persists business profile and verifies responsive LTR/RTL setup state', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(120_000);
    requireDisposablePreview();
    const consoleErrors: string[] = [];
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    monitorBrowserErrors(page, consoleErrors);

    await login(page, owner, ownerPassword);
    await page.goto('/onboarding');
    await expect(page.getByRole('heading', { name: 'Set up Preview Tenant' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reusable business context' })).toBeVisible();
    await expect(page.getByText('2 active member(s)', { exact: true })).toBeVisible();
    await expect(page.getByText('CONNECTED', { exact: true }).first()).toBeVisible();

    await page.getByLabel('Country code').fill('EG');
    await page.getByLabel('Currency code').fill('EGP');
    await page.getByLabel('Primary language').selectOption('en');
    await page.getByLabel('Timezone').fill('Africa/Cairo');
    await page.getByLabel('Industry').selectOption('ECOMMERCE');
    await page.getByLabel('Customer model').selectOption('B2C');
    await page.getByLabel('Commerce model').selectOption('ECOMMERCE');
    await page.getByLabel('Monthly order volume').selectOption('1001_5000');
    await page.getByLabel('Monthly conversation volume').selectOption('5001_20000');
    const analyticsGoal = page.getByRole('checkbox', { name: 'Analytics & ROI' });
    if (!(await analyticsGoal.isChecked())) await analyticsGoal.check();

    await page
      .getByRole('button', { name: /Save business profile|Update business profile/ })
      .click();
    await expect(page.getByRole('status')).toHaveText('Business profile saved.');
    await expect(page.getByText('EG · EGP', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Workspace setup is ready' })).toBeVisible();
    await expect(page.getByText('READY', { exact: true })).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
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
  if (process.env.PREVIEW_E2E !== '1') {
    throw new Error(
      'PREVIEW_E2E=1 is required; this suite must run only against the disposable preview.',
    );
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
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.getByRole('heading', { name: 'Set up Preview Tenant' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Reusable business context' })).toBeVisible();
  await page.getByRole('button', { name: 'العربية · RTL' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  const screenshot = testInfo.outputPath('onboarding-mobile-rtl.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('onboarding-mobile-rtl', {
    path: screenshot,
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'English · LTR' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
}
