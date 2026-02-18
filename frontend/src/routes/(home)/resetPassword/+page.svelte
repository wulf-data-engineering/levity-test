<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { requestPasswordReset } from './request';
	import { ValidatedInput } from '$lib/components/validatedInput';
	import { validateEmail } from '$lib/validation';
	import { ValidatedForm } from '$lib/components/validatedForm';

	let email = $state('');

	let submitting = $state(false);

	onMount(() => {
		const urlEmail = page.url.searchParams.get('email');
		if (urlEmail) {
			email = urlEmail;
		}
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();
		submitting = true;
		try {
			await requestPasswordReset(email);
		} finally {
			submitting = false;
		}
	}
</script>

<Card.Root class="m-auto mt-5 w-full max-w-sm">
	<Card.Header>
		<Card.Title>Reset Password</Card.Title>
		<Card.Description>Enter your Email address to reset your password</Card.Description>
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
					required
				/>
			</div>
		</ValidatedForm>
	</Card.Content>

	<Card.Footer class="flex-col gap-2">
		<Button id="reset-password-btn" disabled={submitting} class="w-full" type="submit" form="form">
			Reset Password
		</Button>
	</Card.Footer>
</Card.Root>
