import { expect, Page } from '@playwright/test';

export async function signUpAndSignIn(page: Page) {
  const testUserEmail = 'test@wulf.technology';
  const email = testUserEmail.replace('@', `+e2e-${new Date().getTime()}-userProfile@`);
  const password = 'Password123!';

	await page.goto('/');
	await page.locator('#sign-up-link').click();

	// Sign Up
	await expect(page.locator('#sign-up-btn')).toBeVisible();
	await page.locator('#email').clear();
	await page.locator('#email').fill(email);
	await page.locator('#password').clear();
	await page.locator('#password').fill(password);
	await page.locator('#confirm').clear();
	await page.locator('#confirm').fill(password);
	await page.locator('#sign-up-btn').click();

	// Confirm Sign Up
	await expect(page.locator('#firstName')).toBeVisible();
	// OTP is prefilled in development
	await page.locator('#firstName').fill('Test');
	await page.locator('#lastName').fill('User');
	await page.locator('button[type=submit]').click();

	// Sign In (if not auto-signed in)
	try {
		await expect(page.locator('#sign-out-btn')).toBeVisible({ timeout: 5000 });
	} catch {
		await page.locator('#email').clear();
		await page.locator('#email').fill(email);
		await page.locator('#password').clear();
		await page.locator('#password').fill(password);
		await page.locator('#sign-in-btn').click();
		await expect(page.locator('#sign-out-btn')).toBeVisible();
	}

	return { email, password };
}
