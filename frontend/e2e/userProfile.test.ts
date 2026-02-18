import { expect, test } from '@playwright/test';
import { signUpAndSignIn } from './utils/auth';

test('User Profile', async ({ page }) => {
	await signUpAndSignIn(page);

	await page.goto('/account');

	await expect(page.getByText('Hello, Test User!')).toBeVisible();
});
