import { expect, test, type Page, type TestInfo } from '@playwright/test';

const reviewSurfaces = [
  'inbox',
  'customers',
  'tickets',
  'orders',
  'confirmation',
  'shipping',
  'recovery',
  'returns',
  'sales',
  'campaigns',
  'automation',
  'operators',
  'approvals',
  'integrations',
  'knowledge',
  'analytics',
  'billing',
  'developer',
  'team',
  'settings',
  'onboarding',
  'organizations',
  'configuration',
  'simulation',
  'custom-data',
  'admin',
  'runtime',
] as const;

test.describe.configure({ mode: 'serial' });

test.describe('backend-independent PRENEURA product review', () => {
  test('renders the complete product map without backend requests', async ({ page }, testInfo) => {
    testInfo.setTimeout(180_000);
    const consoleErrors: string[] = [];
    monitorBrowserErrors(page, consoleErrors);

    await page.goto('/');
    await expect(
      page.getByRole('heading', {
        name: 'One operating system for customer operations and revenue.',
      }),
    ).toBeVisible();
    await expect(page.getByText('27', { exact: true })).toBeVisible();
    await expect(page.locator('a.platform-module-card')).toHaveCount(27);

    for (const surface of reviewSurfaces) {
      const response = await page.goto(`/review/${surface}`);
      expect(response?.ok(), `${surface} review route should answer successfully`).toBe(true);
      await expect(page.getByText('Safe product-review environment')).toBeVisible();
      await expect(page.getByText('Review mode', { exact: true }).first()).toBeVisible();
      await expect(page.locator('.ds-metric')).toHaveCount(4);
      await expect(page.locator('.preview-lane')).toHaveCount(3);
      await expect(page.locator('.preview-table tbody tr')).toHaveCount(3);
    }

    expect(consoleErrors, `Unexpected browser errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('supports keyboard skip navigation and catalog command search', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();

    await page.keyboard.press('Control+k');
    await expect(page.getByRole('heading', { name: 'Find a workspace' })).toBeVisible();
    const commandSearch = page.getByPlaceholder('Module, route, group…');
    await commandSearch.fill('billing');
    await expect(page.getByRole('option')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/review\/billing$/);
    await expect(page.getByRole('heading', { name: 'Billing & usage' })).toBeVisible();
  });

  test('supports local interaction, empty states, mobile layout and Arabic RTL', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    const consoleErrors: string[] = [];
    monitorBrowserErrors(page, consoleErrors);

    await page.goto('/review/sales');
    const search = page.getByLabel('Search preview');
    await search.fill('Delta Retail');
    await expect(page.locator('.preview-table tbody tr')).toHaveCount(1);
    await search.fill('not-present-in-preview');
    await expect(page.getByText('No matching queue items')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.locator('.preview-table tbody tr')).toHaveCount(3);

    await page.getByRole('button', { name: 'Open pipeline board' }).click();
    await expect(page.getByRole('status')).toContainText('Preview only');

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.preview-table thead')).toHaveCSS('display', 'none');

    await page.getByRole('button', { name: 'العربية · RTL' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.getByText('بيئة آمنة لمراجعة المنتج')).toBeVisible();
    await expect(page.getByRole('link', { name: 'المبيعات' })).toBeVisible();

    const screenshot = testInfo.outputPath('product-review-sales-mobile-rtl.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach('product-review-sales-mobile-rtl', {
      path: screenshot,
      contentType: 'image/png',
    });

    expect(consoleErrors, `Unexpected browser errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});

function monitorBrowserErrors(page: Page, errors: string[]) {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
}
