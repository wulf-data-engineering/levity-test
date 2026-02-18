<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import * as auth from '$lib/auth';
	import { Toaster } from '$lib/components/ui/sonner/';

	onMount(async () => {
		// If the static splash was injected (only on the fallback file), remove it.
		document.getElementById('cf-splash')?.remove();
		document.getElementById('cf-splash-style')?.remove();
		await auth.configureAuth();
	});

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Toaster />

{@render children?.()}

<style>
	:global(.link-button) {
		display: inline;
		padding: 0;
		border: 0;
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
		background: transparent;
		color: currentColor;

		appearance: none;
	}
</style>
