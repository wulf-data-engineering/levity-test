/**
 * Checks if the given value is (most likely) a valid email address.
 * It's not possible to fully validate email addresses with regex alone, but this is a good
 * approximation.
 */
export function checkEmail(value: string) {
	return /^(?!.*[.+]{2})[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(
		value
	);
}

/**
 * Validates presence and format of the given email address.
 * Returns error messages if invalid for `ValidatedInput` component.
 */
export function validateEmail(value: string) {
	if (value === '') return 'Email address is required.';
	else if (!checkEmail(value)) return 'Email address is not valid.';
	else return null;
}

type PasswordPolicy = {
	minimumLength: number;
	requireUppercase: boolean;
	requireLowercase: boolean;
	requireNumbers: boolean;
	requireSymbols: boolean;
};

/**
 * Checks if the given value meets the given Cognito policy for a new password.
 */
export function checkNewPassword(value: string, policy: PasswordPolicy) {
	return (
		value.length >= policy.minimumLength &&
		(!policy.requireUppercase || /[A-Z]/.test(value)) &&
		(!policy.requireLowercase || /[a-z]/.test(value)) &&
		(!policy.requireNumbers || /\d/.test(value)) &&
		(!policy.requireSymbols || /[!@#$%^&*(),.?":{}|<>]/.test(value))
	);
}

/**
 * Validates presence of new password and match of an optional Cognito policy.
 * Returns error messages if invalid for `ValidatedInput` component.
 */
export function validateNewPassword(value: string, policy: PasswordPolicy | null) {
	if (value === '') {
		return 'Password is required.';
	}
	if (policy) {
		const requirements = [];
		if (value.length < policy.minimumLength)
			requirements.push(`${policy.minimumLength} characters`);
		if (policy.requireUppercase && !/[A-Z]/.test(value)) requirements.push('an uppercase letter');
		if (policy.requireLowercase && !/[a-z]/.test(value)) requirements.push('a lowercase letter');
		if (policy.requireNumbers && !/\d/.test(value)) requirements.push('a number');
		if (policy.requireSymbols && !/[!@#$%^&*(),.?":{}|<>]/.test(value))
			requirements.push('a symbol');
		if (requirements.length > 0)
			return `Password is missing some requirements: ${requirements.join(', ')}`;
	}
	return null;
}

export function validatePasswordRepetition(newPassword: string, repetition: string) {
	return newPassword === repetition ? null : 'Password does not match its repetition.';
}

export function validateName(value: string) {
	return value.trim().length > 0 ? null : 'Name is required.';
}
