import { expect, test } from '@playwright/test';

const enabled = process.env.PREVIEW_E2E === '1';
const username = process.env.PREVIEW_E2E_USERNAME;
const password = process.env.PREVIEW_E2E_PASSWORD;

test.describe('CRM development preview', () => {
  test.skip(!enabled, 'Set PREVIEW_E2E=1 only against the disposable development preview.');

  test('authenticates through Keycloak and reaches protected customer surfaces', async ({
    page,
  }) => {
    test.skip(!username || !password, 'Set the development-only preview credentials.');
    if (!username || !password) throw new Error('Preview credentials are required for this test.');
    await page.goto('/preview-login');
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/customers$/);
    await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();

    await page.goto('/segments');
    await expect(page.getByRole('heading', { name: 'Segments' })).toBeVisible();
    await expect(page.getByText('Static and tag-rule dynamic segments are live.')).toBeVisible();
  });
});
