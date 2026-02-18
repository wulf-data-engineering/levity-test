<script lang="ts">
	import * as auth from '$lib/auth';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { toastError, toastSuccess } from '../toasts';
	import { ValidatedInput } from '$lib/components/validatedInput';
	import { ValidatedForm } from '$lib/components/validatedForm';
	import {
		validateEmail,
		validateNewPassword,
		validatePasswordRepetition
	} from '$lib/validation';
	import { onMount } from 'svelte';
	import { protocolLoad } from '$lib/protocols';
	import { PasswordPolicy } from '$lib/proto/password_policy/password_policy';

	let email = $state('');
	let password = $state('');
	let confirm = $state('');

	let submitting = $state(false);

	let passwordPolicy: PasswordPolicy | null = $state(null);

	onMount(() => {
		protocolLoad('/api/password-policy', PasswordPolicy)
			.then((data) => {
				passwordPolicy = data;
			})
			.catch((err) => {
				console.error('Error loading password policy:', err);
			});
	});

	async function handleSubmit() {
		submitting = true;
		try {
			const result = await auth.signUp(email, password);
			console.log('Sign up:', result);
			if (result.isSignUpComplete) {
				toastSuccess('Signed Up', 'Successfully signed up and signed in.');
				await goto('/');
			} else if (result.nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
				toastSuccess('Next Step', 'Please complete the sign-up process.');
				const params = new URLSearchParams({
					email
				});
				await goto(`/confirmSignUp?${params.toString()}`);
			} else toastError('Next Step', `${result.nextStep.signUpStep} is not implemented.`);
		} catch (err) {
			console.error('Error signing up:', err);
			if (err instanceof Error && err.name === 'UsernameExistsException')
				toastError('Sign Up Failed', 'The Email address is already registered.');
			else if (err instanceof Error && err.name === 'InvalidPasswordException')
				toastError('Sign Up Failed', 'Password does not meet the required policy.');
			else toastError('Sign Up Failed', 'An error occurred during sign up.');
		} finally {
			submitting = false;
		}
	}
</script>

<Card.Root class="m-auto mt-5 w-full max-w-sm">
	<Card.Header>
		<Card.Title>Sign Up</Card.Title>
		<Card.Description>Create a new account</Card.Description>
	</Card.Header>

	<Card.Content>
		<ValidatedForm id="form" onsubmit={handleSubmit}>
			<div class="flex flex-col gap-6">
				<ValidatedInput
					id="email"
					label="Email"
					type="email"
					bind:value={email}
					validations={[validateEmail]}
				/>

				<ValidatedInput
					id="password"
					label="Password"
					type="password"
					bind:value={password}
					data-policy={passwordPolicy ? 'true' : 'false'}
					validations={[(v) => validateNewPassword(v, passwordPolicy)]}
				/>

				<ValidatedInput
					id="confirm"
					label="Confirm"
					type="password"
					bind:value={confirm}
					validations={[(v) => validatePasswordRepetition(password, v)]}
				/>
			</div>
		</ValidatedForm>
	</Card.Content>

	<Card.Footer class="flex-col gap-2">
		<Button id="sign-up-btn" disabled={submitting} class="w-full" type="submit" form="form">
			Sign Up
		</Button>
		<p>
			Already have an account?
			<a id="sign-in-link" href="/">Sign in</a>
		</p>
	</Card.Footer>
</Card.Root>
