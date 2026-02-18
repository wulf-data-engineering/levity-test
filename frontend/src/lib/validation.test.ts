import { describe, expect, it } from 'vitest';
import { checkEmail, checkNewPassword, validateNewPassword } from '$lib/validation';

describe('validation', () => {
	it('check Emails', async () => {
		expect(checkEmail('.')).toBeFalsy();
		expect(checkEmail('@')).toBeFalsy();
		expect(checkEmail('a@bde')).toBeFalsy();
		expect(checkEmail('+@b.de')).toBeFalsy();

		expect(checkEmail('a@b.de')).toBeTruthy();
		expect(checkEmail('a+b@c.de')).toBeTruthy();
		expect(checkEmail('a.b+c.d@e.f.technology')).toBeTruthy();
	});

	it('validate passwords against policy', async () => {
		const defaultPolicy = {
			minimumLength: 8,
			requireUppercase: true,
			requireLowercase: true,
			requireNumbers: true,
			requireSymbols: true
		};

		expect(checkNewPassword('Test123!', defaultPolicy)).toBeTruthy();
		expect(validateNewPassword('Test123!', defaultPolicy)).toBeNull();

		expect(checkNewPassword('Test1234', defaultPolicy)).toBeFalsy();
		expect(validateNewPassword('Test1234', defaultPolicy)).not.toBeNull();

		expect(checkNewPassword('Test1!', defaultPolicy)).toBeFalsy();
		expect(validateNewPassword('Test1!', defaultPolicy)).not.toBeNull();

		expect(checkNewPassword('test123!', defaultPolicy)).toBeFalsy();
		expect(validateNewPassword('test123!', defaultPolicy)).not.toBeNull();

		expect(checkNewPassword('TEST123!', defaultPolicy)).toBeFalsy();
		expect(validateNewPassword('TEST123!', defaultPolicy)).not.toBeNull();

		const simplePolicy = {
			minimumLength: 6,
			requireUppercase: false,
			requireLowercase: true,
			requireNumbers: false,
			requireSymbols: false
		};

		expect(checkNewPassword('test12', simplePolicy)).toBeTruthy();
		expect(validateNewPassword('test12!', simplePolicy)).toBeNull();

		expect(checkNewPassword('test1', simplePolicy)).toBeFalsy();
		expect(validateNewPassword('test1', simplePolicy)).not.toBeNull();

		expect(checkNewPassword('TEST12', simplePolicy)).toBeFalsy();
		expect(validateNewPassword('TEST12', simplePolicy)).not.toBeNull();
	});
});
