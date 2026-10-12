import { expect, test } from '@playwright/test';

const surfaces = [
  ['inbox', 'Unified inbox'],
  ['customers', 'Customer 360'],
  ['tickets', 'Tickets'],
  ['orders', 'Orders'],
  ['confirmation', 'Order confirmation'],
  ['shipping', 'Shipping'],
  ['returns', 'Returns & refunds'],
  ['recovery', 'Recovery'],
  ['sales', 'Sales'],
  ['campaigns', 'Campaigns'],
  ['analytics', 'Analytics & ROI'],
  ['billing', 'Billing & usage'],
  ['automation', 'Automation studio'],
  ['workflows', 'Workflow operations'],
  ['configuration', 'Configuration studio'],
  ['simulation', 'Configuration simulation'],
  ['integrations', 'Integrations'],
  ['operators', 'AI operators'],
  ['ai-tools', 'AI tool registry'],
  ['ai-routing', 'AI gateway & routing'],
  ['knowledge', 'Knowledge'],
  ['custom-data', 'Custom data'],
  ['developer', 'Developer platform'],
  ['admin', 'Admin control center'],
  ['governance', 'Data governance'],
  ['onboarding', 'Onboarding'],
  ['team', 'Team & roles'],
  ['approvals', 'Approvals'],
  ['settings', 'Organization settings'],
  ['organizations', 'Organizations'],
] as const;

test.describe('backend-independent full product review', () => {
  test('renders all 30 product surfaces without authentication or API state', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(300_000);

    await page.goto('/');
    await expect(
      page.getByRole('heading', {
        name: 'One operating system for customer operations, revenue, automation, and AI.',
      }),
    ).toBeVisible();
    await expect(page.getByText('Full product review mode', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start product tour' })).toHaveAttribute(
      'href',
      '/review/inbox',
    );

    const search = page.getByRole('searchbox', { name: 'Find a module' });
    await page.keyboard.press('/');
    await expect(search).toBeFocused();
    await search.fill('routing');
    await expect(page.getByRole('link', { name: /AI gateway & routing/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Unified inbox/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(search).toHaveValue('');

    for (const [slug, label] of surfaces) {
      await page.goto(`/review/${slug}`);
      await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
      await expect(page.getByText('No backend required', { exact: true })).toBeVisible();
      await expect(page.getByText('Frontend product review mode', { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Open live route' })).toHaveAttribute(
        'href',
        `/${slug}`,
      );
      await expect(page.getByRole('tab', { name: 'Workflow' })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Work queue' })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Signals' })).toBeVisible();
    }
  });

  test('supports local queue filtering, detail inspection, and simulated actions', async ({ page }) => {
    await page.goto('/review/sales');
    await expect(
      page.getByRole('heading', { name: 'Forecast, next actions, and deal quality in one view' }),
    ).toBeVisible();

    await page.getByRole('tab', { name: 'Work queue' }).click();
    const workspaceSearch = page.getByRole('searchbox', { name: 'Search review records' });
    await workspaceSearch.fill('definitely-no-review-record');
    await expect(page.getByText('No review items match these filters.', { exact: true })).toBeVisible();
    await workspaceSearch.clear();

    const firstRow = page.locator('.review-console__row-button').first();
    const selectedName = (await firstRow.textContent())?.trim();
    expect(selectedName).toBeTruthy();
    await firstRow.click();
    if (selectedName) {
      await expect(page.locator('.review-console__detail')).toContainText(selectedName);
    }

    await page.getByRole('tab', { name: 'Signals' }).click();
    const action = page.locator('.preview-actions-grid button').first();
    await expect(action).toBeEnabled();
    await action.click();
    await expect(page.getByRole('status')).toContainText('simulated locally');
    await expect(page.getByRole('status')).toContainText('No API');
  });

  test('keeps navigation responsive, keyboard-friendly, and direction-aware', async ({ page }) => {
    await page.goto('/review/ai-routing');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

    await page.getByRole('button', { name: 'العربية · RTL' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.getByRole('heading', { name: 'AI gateway & routing' })).toBeVisible();

    await page.getByRole('button', { name: 'English · LTR' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.product-shell__sidebar')).toHaveCSS('display', 'none');
    await page.getByText('Menu', { exact: true }).click();
    await expect(page.locator('.product-shell__mobile-panel')).toBeVisible();

    await page.getByRole('tab', { name: 'Work queue' }).click();
    await expect(page.locator('.preview-table thead')).toHaveCSS('display', 'none');
    await expect(page.locator('.review-console__detail')).toBeVisible();
  });
});
