<script lang="ts">
	import { dev } from '$app/environment';
	import * as auth from '$lib/auth';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as InputOTP from '$lib/components/ui/input-otp';
	import * as Card from '$lib/components/ui/card';
	import { toastError, toastSuccess } from '../toasts';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { ValidatedForm } from '$lib/components/validatedForm';

	import { SignUpData } from '$lib/proto/sign_up_data/sign_up_data';

	import { validateName } from '$lib/validation';
	import { ValidatedInput } from '$lib/components/validatedInput';

	let submitting = $state(false);

	let email: string;
	let firstName = $state('');
	let lastName = $state('');

	onMount(async () => {
		let maybeEmail = page.url.searchParams.get('email');
		if (!maybeEmail) {
			toastError('Error', 'Email is required to confirm sign up.');
			await goto('/signUp');
		} else {
			email = maybeEmail;
		}
	});

	let otp = $state(dev ? '123456' : ''); // erased at build time

	async function handleSubmit() {
		submitting = true;
		try {
			const signUpData: SignUpData = { firstName, lastName };
			const result = await auth.confirmSignUp(email, otp, signUpData);
			console.log('Confirm Sign Up:', result);
			if (result.isSignUpComplete) {
				toastSuccess('Signed Up', 'Successfully signed up');
				if (get(auth.isSignedIn)) {
					await goto('/');
				} else {
					await goto(`/?email=${encodeURIComponent(email)}`);
				}
			} else toastError('Next Step', 'Next step is not implemented.');
		} catch (err) {
			console.error('Error confirming sign up:', err);
			if (err instanceof Error && err.name === 'CodeMismatchException') {
				toastError('Confirmation Failed', 'The provided confirmation code is incorrect.');
			} else if (err instanceof Error && err.name === 'ExpiredCodeException') {
				try {
					await get(auth.authApi).resendSignUpCode({ username: email! });
					toastError(
						'Code Sent',
						'The provided confirmation code has expired. A new confirmation code has been sent to your email.'
					);
				} catch {
					if (dev)
						toastError('Confirmation Failed', 'Cognito local might not support resending codes.'); // erased at build time
					else toastError('Confirmation Failed', 'The provided confirmation code has expired.');
				}
			} else toastError('Confirmation Failed', 'Sign up could not be confirmed.');
		} finally {
			submitting = false;
		}
	}

	async function resendCode() {
		try {
			submitting = true;
			await get(auth.authApi).resendSignUpCode({ username: email! });
			toastSuccess('Code Sent', 'A new confirmation code has been sent to your email.');
		} catch (err) {
			console.error('Error resending code:', err);
			toastError('Error', 'Could not resend confirmation code.');
		} finally {
			submitting = false;
		}
	}
</script>

<Card.Root class="m-auto mt-5 w-full max-w-sm">
	<Card.Header>
		<Card.Title>Confirm Account</Card.Title>
		<Card.Description>Enter the confirmation code you received</Card.Description>
	</Card.Header>

	<Card.Content>
		<ValidatedForm id="form" onsubmit={handleSubmit}>
			<div class="flex flex-col gap-6">
				<ValidatedInput
					id="firstName"
					label="First Name"
					type="text"
					bind:value={firstName}
					validations={[validateName]}
				/>

				<ValidatedInput
					id="lastName"
					label="Last Name"
					type="text"
					bind:value={lastName}
					validations={[validateName]}
				/>

				<InputOTP.Root id="otp" maxlength={6} bind:value={otp} class="justify-center" required>
					{#snippet children({ cells })}
						<InputOTP.Group>
							{#each cells as cell (cell)}
								<InputOTP.Slot {cell} />
							{/each}
						</InputOTP.Group>
					{/snippet}
				</InputOTP.Root>
			</div>
		</ValidatedForm>
	</Card.Content>

	<Card.Footer class="flex-col gap-2">
		<Button variant="default" disabled={submitting} class="w-full" type="submit" form="form">
			Confirm Sign Up
		</Button>
		<Button variant="outline" disabled={submitting} class="w-full" onclick={resendCode}>
			Resend Code
		</Button>
	</Card.Footer>
</Card.Root>
