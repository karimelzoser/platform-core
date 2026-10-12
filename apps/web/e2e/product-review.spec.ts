import { expect, test } from '@playwright/test';

const surfaces = [
  ['inbox', 'Unified inbox'],
  ['customers', 'Customer 360'],
  ['tickets', 'Tickets'],
  ['confirmation', 'Order confirmation'],
  ['returns', 'Returns & refunds'],
  ['recovery', 'Recovery'],
  ['orders', 'Orders'],
  ['shipping', 'Shipping'],
  ['sales', 'Sales'],
  ['campaigns', 'Campaigns'],
  ['analytics', 'Analytics & ROI'],
  ['billing', 'Billing & usage'],
  ['automation', 'Automation studio'],
  ['operators', 'AI operators'],
  ['knowledge', 'Knowledge'],
  ['approvals', 'Approvals'],
  ['integrations', 'Integrations'],
  ['developer', 'Developer platform'],
  ['onboarding', 'Onboarding'],
  ['team', 'Team & roles'],
  ['settings', 'Organization settings'],
  ['organizations', 'Organizations'],
] as const;

test.describe('backend-independent product review', () => {
  test(
    'renders every product surface without authentication or API state',
    async ({ page }, testInfo) => {
      testInfo.setTimeout(240_000);

      await page.goto('/');
      await expect(
        page.getByRole('heading', {
          name: 'One operating system for customer operations and revenue.',
        }),
      ).toBeVisible();
      await expect(page.getByText('Full product review mode', { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Start product tour' })).toHaveAttribute(
        'href',
        '/review/inbox',
      );

      const search = page.getByRole('searchbox', { name: 'Find a module' });
      await search.fill('shipping');
      await expect(page.getByRole('link', { name: /Shipping/ })).toBeVisible();
      await expect(page.getByRole('link', { name: /Unified inbox/ })).toHaveCount(0);
      await search.clear();

      for (const [slug, label] of surfaces) {
        await page.goto(`/review/${slug}`);
        await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
        await expect(page.getByText('No backend required', { exact: true })).toBeVisible();
        await expect(page.getByText('Sample records only', { exact: true })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Open live route' })).toHaveAttribute(
          'href',
          `/${slug}`,
        );
        await expect(page.locator('.preview-actions-grid button').first()).toBeDisabled();
      }
    },
  );

  test('keeps navigation responsive and direction-aware', async ({ page }) => {
    await page.goto('/review/inbox');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

    await page.getByRole('button', { name: 'العربية · RTL' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');

    await page.getByRole('button', { name: 'English · LTR' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.product-shell__sidebar')).toHaveCSS('display', 'none');
    await page.getByText('Menu', { exact: true }).click();
    await expect(page.locator('.product-shell__mobile-panel')).toBeVisible();
    await expect(page.locator('.preview-table thead')).toHaveCSS('display', 'none');
  });
});
