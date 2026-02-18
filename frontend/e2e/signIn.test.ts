import { expect, test } from '@playwright/test';

test('sign in', async ({ page }) => {
	// Given: the home page with sign in box

	await page.goto('/');
	await expect(page.locator('h1')).toBeVisible();

	const email = page.locator('#email');
	const password = page.locator('#password');
	const submit = page.locator('button[type=submit]');
	const signOut = page.locator('#sign-out-btn');
	const toastError = page.locator('li[data-type=error]');

	const emailMsg = page.locator('#email-msg');

	await expect(email).toBeVisible();
	await expect(password).toBeVisible();
	await expect(submit).toBeVisible();
	await email.clear();
	await password.clear();

	// When: submitting without data

	await submit.click();

	// Then: fields are marked as invalid

	await expect(email).toHaveAttribute('aria-invalid');
	expect(await email.getAttribute('aria-invalid')).toBe('true');

	// When: submitting with invalid Email address

	await email.fill('invalid');
	await submit.click();

	// Then: email is marked as invalid and shows a validation text

	await expect(email).toHaveAttribute('aria-invalid', 'true');
	await expect(emailMsg).toBeVisible();

	// When: submitting with incorrect credentials

	await email.fill('test@wulf.technology');
	await password.fill('Password123!-wrong');
	await submit.click();

	// Then: an error toast shows up informing about the failed sign in

	await expect(toastError).toBeVisible();

	// When: submitting with correct credentials

	await email.clear();
	await email.fill('test@wulf.technology');
	await password.clear();
	await password.fill('Password123!');
	await submit.click();

	// Then: switches to signed in mode

	await expect(page).toHaveURL('/');
	await expect(signOut).toBeVisible();
	await expect(email).not.toBeVisible();
	await expect(password).not.toBeVisible();

	// When: clicking sign-out

	await signOut.click();

	// Then: switches back to sign-in box

	await expect(page).toHaveURL('/');
	await expect(signOut).not.toBeVisible();
	await expect(email).toBeVisible();
	await expect(password).toBeVisible();
});
