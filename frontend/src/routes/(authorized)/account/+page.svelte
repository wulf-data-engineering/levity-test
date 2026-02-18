<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { signOut } from '$lib/auth';
	import { goto } from '$app/navigation';
	import * as Alert from '$lib/components/ui/alert';
	import CheckCircle2Icon from '@lucide/svelte/icons/check-circle-2';

	let { data } = $props();
	let currentUser = data.currentUser!;
	let userProfile = $derived(data.userProfile);

	async function authSignOut() {
		await signOut();
		await goto('/');
	}
</script>

<svelte:head>
	<title>Protected Page</title>
	<meta name="description" content="Protected route" />
</svelte:head>

<div class="m-auto max-w-5xl p-5 px-8">
	<h1 class="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">Account</h1>
	<p class="text-xl leading-7 text-muted-foreground [&:not(:first-child)]:mt-6">
		This is a page for signed in users.
	</p>

	<div class="m-auto grid w-full max-w-xl items-start gap-4 p-5">
		<Alert.Root>
			<CheckCircle2Icon />
			<Alert.Title>You are signed in as {currentUser.signInDetails?.loginId}</Alert.Title>
			<Alert.Description>
				<small class="text-muted-foreground">{currentUser.userId}</small>
				{#if userProfile}
					<div class="mt-2 font-medium">
						Hello, {userProfile.firstName}
						{userProfile.lastName}!
					</div>
				{/if}
			</Alert.Description>
		</Alert.Root>

		<Button variant="outline" onclick={authSignOut}>Sign Out</Button>
	</div>
</div>
