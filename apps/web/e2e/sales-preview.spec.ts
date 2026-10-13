import { expect, test, type Page, type TestInfo } from '@playwright/test';

const owner = requiredEnvironment('PREVIEW_E2E_OWNER_USERNAME');
const ownerPassword = requiredEnvironment('PREVIEW_E2E_OWNER_PASSWORD');

test.describe.configure({ mode: 'serial' });

test.describe('Sales disposable development preview', () => {
  test('runs CRM-linked sales lifecycle with responsive and RTL evidence', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(180_000);
    requireDisposablePreview();
    const consoleErrors: string[] = [];
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    monitorBrowserErrors(page, consoleErrors);

    await login(page);
    const stamp = Date.now().toString(36);
    const customerId = await createCustomer(
      page,
      `Sales E2E ${stamp}`,
      `sales-${stamp}@example.test`,
    );

    await page.goto('/sales');
    await expect(page.getByRole('heading', { name: 'Sales pipeline', exact: true })).toBeVisible();

    const pipelineCard = surfaceCardByHeading(page, 'Create a configurable pipeline');
    await pipelineCard.getByLabel('Pipeline name').fill(`E2E pipeline ${stamp}`);
    await pipelineCard.getByRole('button', { name: 'Create pipeline' }).click();
    await expect(page.getByRole('status')).toHaveText('Sales pipeline created.');

    const leadsCard = surfaceCardByHeading(page, 'Qualify CRM customers');
    await leadsCard.getByLabel('CRM customer ID').fill(customerId);
    await leadsCard.getByLabel('Lead source').fill('browser-e2e');
    await leadsCard.getByRole('button', { name: 'Create lead' }).click();
    await expect(page.getByRole('status')).toHaveText('Sales lead created from the CRM customer.');

    const leadCard = page
      .locator('.identity-member-card')
      .filter({ hasText: `Sales E2E ${stamp}` })
      .first();
    await expect(leadCard).toBeVisible();
    const leadId = await leadCard.locator('input[name="leadId"]').inputValue();
    await leadCard.getByLabel('Score').fill('92');
    await leadCard.getByLabel('Grade').selectOption('HOT');
    await leadCard.getByLabel('Qualification').selectOption('QUALIFIED');
    await leadCard
      .getByLabel('Qualification notes')
      .fill('Budget and timing confirmed in browser acceptance.');
    await leadCard.getByRole('button', { name: 'Update qualification' }).click();
    await expect(page.getByRole('status')).toHaveText('Lead qualification updated.');

    const opportunityCard = surfaceCardByHeading(page, 'Commercial pipeline');
    const opportunityForm = opportunityCard.locator('form').first();
    await opportunityForm.getByLabel('CRM customer ID').fill(customerId);
    await opportunityForm.getByLabel('Lead ID (optional)').fill(leadId);
    await opportunityForm.getByLabel('Opportunity name').fill(`E2E opportunity ${stamp}`);
    await opportunityForm
      .getByLabel('Pipeline / initial stage')
      .selectOption({ label: `E2E pipeline ${stamp} · Qualified · 25%` });
    await opportunityForm.getByLabel('Expected value (minor units)').fill('2500000');
    await opportunityForm.getByRole('button', { name: 'Create opportunity' }).click();
    await expect(page.getByRole('status')).toHaveText('Sales opportunity created.');

    const opportunityRow = page.getByRole('row').filter({ hasText: `E2E opportunity ${stamp}` });
    await expect(opportunityRow).toContainText('Qualified');
    const opportunityId = await opportunityRow
      .locator('input[name="opportunityId"]')
      .first()
      .inputValue();
    await opportunityRow.getByText('Update', { exact: true }).click();
    await opportunityRow.getByLabel('Open stage').selectOption({ label: 'Proposal · 60%' });
    await opportunityRow.getByLabel('Reason').fill('Proposal submitted');
    await opportunityRow.getByRole('button', { name: 'Move stage' }).click();
    await expect(page.getByRole('status')).toHaveText('Opportunity stage updated.');
    await expect(
      page.getByRole('row').filter({ hasText: `E2E opportunity ${stamp}` }),
    ).toContainText('Proposal');

    const activitiesCard = surfaceCardByHeading(page, 'Tasks and touchpoints');
    const activityForm = activitiesCard.locator('form').first();
    await activityForm.getByLabel('CRM customer ID').fill(customerId);
    await activityForm.getByLabel('Opportunity ID').fill(opportunityId);
    await activityForm.getByLabel('Type').selectOption('TASK');
    await activityForm.getByLabel('Subject').fill(`Proposal follow-up ${stamp}`);
    await activityForm.getByRole('button', { name: 'Add activity' }).click();
    await expect(page.getByRole('status')).toHaveText('Sales activity created.');

    const activityCard = page
      .locator('.identity-member-card')
      .filter({ hasText: `Proposal follow-up ${stamp}` });
    await activityCard.getByRole('button', { name: 'Mark complete' }).click();
    await expect(page.getByRole('status')).toHaveText('Sales activity completed.');
    await expect(
      page.locator('.identity-member-card').filter({ hasText: `Proposal follow-up ${stamp}` }),
    ).toContainText('DONE');

    const finalRow = page.getByRole('row').filter({ hasText: `E2E opportunity ${stamp}` });
    await finalRow.getByText('Update', { exact: true }).click();
    await finalRow.getByLabel('Loss reason').fill('Browser acceptance closure');
    await finalRow.getByRole('button', { name: 'Mark lost' }).click();
    await expect(page.getByRole('status')).toHaveText('Opportunity marked lost.');
    await expect(
      page.getByRole('row').filter({ hasText: `E2E opportunity ${stamp}` }),
    ).toContainText('LOST');

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

function surfaceCardByHeading(page: Page, heading: string) {
  return page
    .getByRole('heading', { name: heading, exact: true })
    .locator('xpath=ancestor::section[contains(concat(" ", normalize-space(@class), " "), " ds-card ")][1]');
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

async function createCustomer(page: Page, displayName: string, email: string): Promise<string> {
  await page.goto('/customers/new');
  await page.getByLabel('Display name').fill(displayName);
  await page.getByLabel('Email').fill(email);
  await Promise.all([
    page.waitForURL(/\/customers\/[0-9a-f-]{36}$/),
    page.getByRole('button', { name: 'Create customer' }).click(),
  ]);
  const customerId = page.url().match(/\/customers\/([0-9a-f-]{36})$/i)?.[1];
  if (!customerId) throw new Error('Customer creation did not return a canonical customer ID.');
  return customerId;
}

async function assertResponsiveAndRtl(page: Page, testInfo: TestInfo) {
  await page.goto('/sales');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Sales pipeline', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'العربية · RTL' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  const screenshot = testInfo.outputPath('sales-mobile-rtl.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('sales-mobile-rtl', { path: screenshot, contentType: 'image/png' });
  await page.getByRole('button', { name: 'English · LTR' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
}
