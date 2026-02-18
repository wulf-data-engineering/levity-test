<script lang="ts">
	import { dev } from '$app/environment';
	import * as auth from '$lib/auth';
	import { currentUser } from '$lib/auth';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { toastError, toastSuccess } from './toasts';
	import { onMount } from 'svelte';
	import { validateEmail } from '$lib/validation';
	import { ValidatedInput } from '$lib/components/validatedInput';
	import { ValidatedForm } from '$lib/components/validatedForm';

	async function signOut() {
		try {
			loading = true;
			await auth.signOut();
			toastSuccess('Signed Out', 'Successfully signed out.');
		} catch (err) {
			console.error('Error signing out:', err);
			toastError('Sign Out Failed', 'Could not sign out.');
		} finally {
			loading = false;
		}
	}

	let email = $state('');
	let password = $state('');

	let autofocusPassword = $state(false);

	onMount(async () => {
		let maybeEmail = page.url.searchParams.get('email');
		if (maybeEmail) {
			email = maybeEmail;
			autofocusPassword = true;
		} else if (dev) {
			// erased at build time
			email = 'test@wulf.technology';
			password = 'Password123!';
		}
	});

	let loading = $state(false);

	async function handleSubmit() {
		loading = true;

		const resetRequired = async () => {
			toastError('Sign In Failed', 'Password reset is required.');
			await goto(`/resetPassword?email=${encodeURIComponent(email)}`);
		};

		try {
			const result = await auth.signIn(email, password);
			console.log('Sign in:', result);
			if (result.isSignedIn) {
				// Redirect to the originally requested page
				const redirectTo = page.url.searchParams.get('redirectTo');
				if (redirectTo) await goto(redirectTo);
				else toastSuccess('Signed In', 'Successfully signed in.');
			} else if (result.nextStep.signInStep === 'CONFIRM_SIGN_UP') {
				toastSuccess('Next Step', 'Please complete the sign-up process.');
				await goto(`/confirmSignUp?email=${encodeURIComponent(email)}`);
			} else if (result.nextStep.signInStep === 'RESET_PASSWORD') await resetRequired();
			else toastError('Next Step', `${result.nextStep.signInStep} is not implemented.`);
		} catch (err) {
			console.error('Error signing in:', err);
			if (
				err instanceof Error &&
				(err.name === 'NotAuthorizedException' ||
					err.name === 'UserNotFoundException' ||
					err.name === 'InvalidPasswordException')
			)
				toastError('Sign In Failed', 'Incorrect email or password.');
			else if (err instanceof Error && err.name === 'PasswordResetRequiredException')
				await resetRequired();
			else toastError('Sign In Failed', 'An error occurred during sign in.');
		} finally {
			loading = false;
		}
	}
</script>

<Card.Root class="m-auto mt-5 w-full max-w-sm">
	{#if $currentUser}
		<Card.Header>
			<Card.Title>Signed In</Card.Title>
			<Card.Description>You are signed in</Card.Description>
			<Card.Action>
				<Button variant="link" href="/account">Your account</Button>
			</Card.Action>
		</Card.Header>

		<Card.Content>
			<p>
				You are signed in as {$currentUser.signInDetails?.loginId}.
				<br />
				<small class="text-muted-foreground">{$currentUser.userId}</small>
			</p>
		</Card.Content>

		<Card.Footer class="flex-col gap-2">
			<Button
				id="sign-out-btn"
				onclick={signOut}
				disabled={loading}
				variant="outline"
				class="w-full"
			>
				Sign Out
			</Button>
		</Card.Footer>
	{:else if $currentUser === null}
		<Card.Header>
			<Card.Title>Sign In</Card.Title>
			<Card.Description>Sign in to your account</Card.Description>
		</Card.Header>

		<Card.Content>
			<ValidatedForm id="form" onsubmit={handleSubmit}>
				<div class="flex flex-col gap-6">
					<ValidatedInput
						id="email"
						label="Email"
						type="email"
						bind:value={email}
						autofocus={!autofocusPassword}
						validations={[validateEmail]}
						required
					/>

					<ValidatedInput
						id="password"
						label="Password"
						type="password"
						bind:value={password}
						autofocus={autofocusPassword}
						required
					/>
				</div>
			</ValidatedForm>
		</Card.Content>

		<Card.Footer class="flex-col gap-2">
			<Button id="sign-in-btn" disabled={loading} class="w-full" type="submit" form="form">
				Sign In
			</Button>
			<Button
				id="password-forgotten-btn"
				disabled={loading}
				class="w-full"
				href={`/resetPassword?email=${encodeURIComponent(email)}`}
				variant="outline"
			>
				Password Forgotten?
			</Button>
			<p>
				Don’t have an account?
				<a id="sign-up-link" href="/signUp">Sign up</a>
			</p>
		</Card.Footer>
	{:else}
		<Card.Content>
			<p>Loading…</p>
		</Card.Content>
	{/if}
</Card.Root>
