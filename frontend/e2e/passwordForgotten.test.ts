import { expect, test } from '@playwright/test';

test('password forgotten', async ({ page }) => {
	// Given: the home page with sign in box

	await page.goto('/');
	await expect(page.locator('h1')).toBeVisible();

	const email = page.locator('#email');
	const password = page.locator('#password');
	const confirm = page.locator('#confirm');
	const otp = page.locator('#otp');
	const submit = page.locator('button[type=submit]');
	const passwordForgotten = page.locator('#password-forgotten-btn');
	const resetPassword = page.locator('#reset-password-btn');
	const resendCode = page.locator('#resend-code-btn');
	const signOut = page.locator('#sign-out-btn');

	const emailMsg = page.locator('#email-msg');
	const passwordMsg = page.locator('#password-msg');
	const confirmMsg = page.locator('#confirm-msg');

	await expect(email).toBeVisible();
	await expect(password).toBeVisible();
	await expect(passwordForgotten).toBeVisible();
	await email.clear();
	await password.clear();

	// When: clicking password forgotten

	await passwordForgotten.click();

	// Then: switch to reset password form

	await expect(email).toBeVisible();
	await expect(password).not.toBeVisible();
	await expect(passwordForgotten).not.toBeVisible();
	await expect(resetPassword).toBeVisible();

	// When: clicking the reset password button

	await resetPassword.click();

	// Then: email is marked as invalid and shows a validation text

	await expect(email).toHaveAttribute('aria-invalid');
	expect(await email.getAttribute('aria-invalid')).toBe('true');
	await expect(emailMsg).toBeVisible();

	// When: submitting with valid Email address

	await email.fill('test@wulf.technology');
	await submit.click();

	// Then: switch to the form to confirm password reset

	await expect(otp).toBeVisible();
	await expect(email).toBeVisible();
	await expect(password).toBeVisible();
	await expect(confirm).toBeVisible();
	await expect(resetPassword).toBeVisible();
	await expect(resendCode).toBeVisible();

	await expect(email).toHaveValue('test@wulf.technology');

	// Await loading of the password policy
	await expect(password).toHaveAttribute('data-policy', 'true');

	// When: submitting without new password

	await password.fill('P');
	await submit.click();

	// Then: password is marked as invalid and shows a validation text

	await expect(password).toHaveAttribute('aria-invalid', 'true');
	await expect(passwordMsg).toBeVisible();

	// When: submitting with valid password but without repetition

	await password.fill('Password123!');
	await submit.click();

	// Then: repetition is marked as invalid and shows a validation text

	await expect(confirm).toHaveAttribute('aria-invalid', 'true');
	await expect(confirmMsg).toBeVisible();

	// When: submitting with valid data

	await confirm.fill('Password123!');
	await submit.click();

	// Then: switches back to home in signed in mode

	await expect(page).toHaveURL('/');
	await expect(signOut).toBeVisible();
	await expect(email).not.toBeVisible();
	await expect(password).not.toBeVisible();
});
