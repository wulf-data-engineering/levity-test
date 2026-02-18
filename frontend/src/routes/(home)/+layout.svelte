<script lang="ts">
	let { children } = $props();
</script>

<svelte:head>
	<title>Tool-Set Project</title>
</svelte:head>
<div class="m-auto max-w-4xl p-5 px-8">
	<div>
		<h1 class="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">
			Tool-Set Project
		</h1>
		<p class="text-xl leading-7 text-muted-foreground [&:not(:first-child)]:mt-6">
			This is a sample landing page.
		</p>
	</div>
	{@render children?.()}
</div>
