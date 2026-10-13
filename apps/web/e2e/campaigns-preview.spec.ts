import { expect, test, type Page, type TestInfo } from '@playwright/test';

const owner = requiredEnvironment('PREVIEW_E2E_OWNER_USERNAME');
const ownerPassword = requiredEnvironment('PREVIEW_E2E_OWNER_PASSWORD');

test.describe.configure({ mode: 'serial' });

test.describe('Campaigns disposable development preview', () => {
  test('creates and freezes a verified-consent campaign with responsive RTL evidence', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(180_000);
    requireDisposablePreview();
    const consoleErrors: string[] = [];
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    monitorBrowserErrors(page, consoleErrors);

    await login(page);
    await page.goto('/campaigns');
    await expect(
      page.getByRole('heading', { name: 'Campaign orchestration', exact: true }),
    ).toBeVisible();

    const stamp = Date.now().toString(36);
    const createCard = page
      .getByRole('heading', { name: 'New consent-aware campaign', exact: true })
      .locator(
        'xpath=ancestor::section[contains(concat(" ", normalize-space(@class), " "), " ds-card ")][1]',
      );
    await createCard.getByLabel('Campaign name').fill(`E2E campaign ${stamp}`);
    await createCard.getByLabel('Channel').selectOption('WHATSAPP');
    await createCard
      .getByLabel('Outbound connection')
      .selectOption({ label: /Development WhatsApp Cloud API/ });
    await createCard
      .getByLabel('Message template')
      .selectOption({ label: /Preview campaign WhatsApp/ });
    await createCard.getByLabel('Timezone').fill('UTC');
    await createCard.getByLabel('Send window start').fill('00:00');
    await createCard.getByLabel('Send window end').fill('23:59');
    await createCard.getByLabel('Batch size').fill('500');
    await createCard.getByLabel('Attribution window (hours)').fill('168');
    await createCard.getByRole('button', { name: 'Create campaign' }).click();
    await expect(page.locator('.identity-notice[role="status"]')).toHaveText('Campaign created.');

    const campaignCard = page
      .locator('.identity-member-card')
      .filter({ hasText: `E2E campaign ${stamp}` });
    await expect(campaignCard).toBeVisible();
    await expect(campaignCard.getByText('DRAFT', { exact: true })).toBeVisible();
    await campaignCard.getByRole('button', { name: 'Freeze audience' }).click();
    await expect(page.locator('.identity-notice[role="status"]')).toContainText('Audience frozen:');

    const frozenCard = page
      .locator('.identity-member-card')
      .filter({ hasText: `E2E campaign ${stamp}` });
    await expect(frozenCard).toContainText(/\d+ eligible/);
    await expect(frozenCard).toContainText(/\d+ suppressed/);
    const eligibleText = await frozenCard.locator('.ds-badge').filter({ hasText: 'eligible' }).textContent();
    const suppressedText = await frozenCard
      .locator('.ds-badge')
      .filter({ hasText: 'suppressed' })
      .textContent();
    expect(Number.parseInt(eligibleText ?? '0', 10)).toBeGreaterThan(0);
    expect(Number.parseInt(suppressedText ?? '0', 10)).toBeGreaterThan(0);
    await expect(frozenCard.getByLabel('Approval ID')).toBeVisible();
    await expect(frozenCard.getByRole('button', { name: 'Start campaign' })).toBeVisible();

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
  await page.goto('/campaigns');
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(
    page.getByRole('heading', { name: 'Campaign orchestration', exact: true }),
  ).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'العربية · RTL' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await assertNoHorizontalOverflow(page);
  const screenshot = testInfo.outputPath('campaigns-mobile-rtl.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('campaigns-mobile-rtl', { path: screenshot, contentType: 'image/png' });
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
