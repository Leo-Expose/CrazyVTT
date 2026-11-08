import { test, expect } from '@playwright/test';
import { ADMIN } from './instance';

test('DM phase tools are reachable from the campaign toolbar', async ({ page }, testInfo) => {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const campaignName = `Phase tools ${testInfo.project.name} ${Date.now()}`;
  await page.getByRole('button', { name: 'Create Campaign' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create Campaign' });
  await dialog.getByLabel('Campaign Name').fill(campaignName);
  await dialog.getByRole('button', { name: 'Create Campaign' }).click();
  await expect(page.getByRole('alert')).toContainText(`Campaign "${campaignName}" created!`);
  await page.getByRole('button', { name: new RegExp(campaignName) }).click();
  await expect(page.getByRole('heading', { name: campaignName, level: 1 })).toBeVisible();
  if (testInfo.project.name === 'phone') {
    await page.getByRole('button', { name: 'Continue anyway' }).click();
  }

  await page.getByRole('button', { name: 'Spell Templates (AoE)' }).click();
  await expect(page.getByTestId('spell-template-placer')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Rulebooks' }).click();
  await expect(page.getByRole('dialog', { name: /campaign documents/i })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Shops & Merchants' }).click();
  await expect(page.getByText(/shop/i).first()).toBeVisible();
});
