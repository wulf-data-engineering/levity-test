<script lang="ts">
	import type { WithElementRef } from '$lib/utils';
	import type { HTMLFormAttributes } from 'svelte/elements';
	import { setContext } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';

	// ---- Context shared with ValidatedInput
	export type InputHandle = {
		id: string;
		check: () => boolean; // true if valid, touches the field
		focus?: () => void;
	};

	export type ValidatedFormContext = {
		register: (f: InputHandle) => () => void;
	};

	export const VALIDATED_FORM_CONTEXT = 'ValidatedFormContext';

	type Props = WithElementRef<HTMLFormAttributes>;

	let {
		ref = $bindable<HTMLFormElement | null>(null),
		onsubmit,
		action,
		children,
		...restProps
	}: Props = $props();

	if (!onsubmit) {
		throw new Error("ValidatedForm requires an 'onsubmit' handler.");
	} else if (action) {
		console.warn("ValidatedForm: 'action' prop is ignored.");
	}

	// ---- Registry & shared state
	const fields = new SvelteMap<string, InputHandle>();

	function register(field: InputHandle) {
		fields.set(field.id, field);
		return () => fields.delete(field.id);
	}

	setContext<ValidatedFormContext>(VALIDATED_FORM_CONTEXT, { register });

	// Validate all registered fields, mark touched, and grab first invalid
	function validateAll() {
		let firstInvalid: InputHandle | null = null;
		let allValid = true;

		for (const f of fields.values()) {
			const ok = f.check();
			if (!ok && !firstInvalid) firstInvalid = f;
			allValid = allValid && ok;
		}
		return { allValid, firstInvalid };
	}

	// prevent default, validate, then call user's onsubmit if valid
	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();

		const { allValid, firstInvalid } = validateAll();

		if (!allValid) {
			if (ref) {
				(ref as HTMLFormElement).reportValidity(); // surfaces native messages if any
			}
			firstInvalid?.focus?.();
			return;
		}

		await onsubmit?.(e as never); // cast to satisfy Svelte's typing
	}
</script>

<form bind:this={ref} onsubmit={handleSubmit} novalidate {...restProps}>
	{@render children?.()}
</form>
