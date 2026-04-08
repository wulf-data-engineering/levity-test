<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { signOut } from '$lib/auth';
	import { goto } from '$app/navigation';
	import * as Alert from '$lib/components/ui/alert';
	import CheckCircle2Icon from '@lucide/svelte/icons/check-circle-2';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { createProcess } from '$lib/api/process';
	import { fetchAuthSession } from 'aws-amplify/auth';
	import { onMount, onDestroy } from 'svelte';
	import { getWebSocketUrl } from '$lib/websockets';
	import { get } from 'svelte/store';

	let { data } = $props();
	let currentUser = $derived(data.currentUser!);
	let userProfile = $derived(data.userProfile);
	let processResponse = $state<string | null>(null);
	let messages = $state<string[]>([]);
	let socket = $state<WebSocket | null>(null);
	let processInput = $state<string>('');

	async function launchProcess() {
		try {
			const res = await createProcess(processInput);
			processResponse = res.topic;
			messages = []; // Reset messages for new process
			await connectToWebsocket(res.topic);
		} catch (e) {
			console.error(e);
			processResponse = 'Error launching process';
		}
	}

	async function connectToWebsocket(topicId: string) {
		if (socket) {
			socket.close();
		}

		// In development, the proxy at /api/websocket handles the redirection to the mock
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		
		const session = await fetchAuthSession();
		const token = session.tokens?.idToken?.toString();
		
		const configuredWsUrl = await getWebSocketUrl();
		const baseUrl = configuredWsUrl.replace(/\/$/, '');
		const wsUrl = baseUrl 
			? `${baseUrl}/websocket?topicId=${topicId}`
			: `${protocol}//${window.location.host}/api/websocket/websocket?topicId=${topicId}`;
		
		console.log('Connecting to WebSocket (via Sec-WebSocket-Protocol):', topicId);
		const ws = new WebSocket(wsUrl, token ? [token] : undefined);

		ws.onopen = () => {
			console.log('WebSocket connected');
			messages.push('connected');
		};

		ws.onmessage = (event) => {
			console.log('WebSocket message received:', event.data);
			messages.push(event.data);
		};

		ws.onerror = (error) => {
			console.error('WebSocket error:', error);
			messages.push('error: failed to connect');
		};

		ws.onclose = () => {
			console.log('WebSocket closed');
		};

		socket = ws;
	}

	onDestroy(() => {
		if (socket) {
			socket.close();
		}
	});

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


		<Card.Root>
			<Card.Header>
				<Card.Title>Launch Process</Card.Title>
				<Card.Description>Launch a new background process for your account.</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if processResponse}
					<div class="mb-4">
						<h3 class="mb-1 text-sm font-medium">Topic ID:</h3>
						<pre class="overflow-x-auto rounded bg-muted p-2 text-xs">{processResponse}</pre>
					</div>

					<div class="mb-4">
						<h3 class="mb-1 text-sm font-medium">Updates:</h3>
						<div class="flex flex-col gap-2">
							{#each messages as message}
								<pre class="overflow-x-auto rounded bg-muted p-2 text-xs">{message}</pre>
							{/each}
						</div>
					</div>
				{/if}
				<div class="flex flex-col gap-2">
					<Input type="text" placeholder="Process input data" bind:value={processInput} />
					<Button onclick={launchProcess} class="w-full">Launch Process</Button>
				</div>
			</Card.Content>
		</Card.Root>

		<Button variant="outline" onclick={authSignOut}>Sign Out</Button>
	</div>
</div>
