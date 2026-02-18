import { get } from 'svelte/store';
import { toastError, toastSuccess } from '../toasts';
import { goto } from '$app/navigation';
import { authApi } from '$lib/auth';

/**
 * Request a password reset for the given email address using the Cognito API.
 * In case of success, navigates to the confirm reset password page.
 * In case of failure, shows an error toast.
 */
export async function requestPasswordReset(email: string) {
	try {
		const result = await get(authApi).resetPassword({
			username: email
		});
		switch (result.nextStep.codeDeliveryDetails.deliveryMedium) {
			case 'EMAIL':
				toastSuccess('Code Sent', 'We have sent you an Email with a code to reset your password.');
				break;
			case 'SMS':
				toastSuccess('Code Sent', 'We have sent you an SMS with a code to reset your password.');
				break;
			default:
				toastSuccess('Code Sent', 'We have sent you a code to reset your password.');
		}
		await goto(`/confirmResetPassword?email=${encodeURIComponent(email)}`);
		return true;
	} catch (err) {
		console.error('Error requesting password reset:', err);
		if (err instanceof Error && err.name === 'UserNotFoundException')
			toastError('Password Reset Failed', 'The Email address is not registered.');
		else if (err instanceof Error && err.name === 'LimitExceededException')
			toastError('Password Reset Failed', 'Please try again later.');
		else toastError('Password Reset Failed', 'An error occurred resetting your password.');
		return false;
	}
}
