<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { ValidatedForm } from '.';
	import { ValidatedInput } from '../validatedInput';
	import { fn } from 'storybook/test';

	const { Story } = defineMeta({
		render,
		title: 'Example/ValidatedForm',
		component: ValidatedForm,
		tags: ['autodocs'],
		args: {
			onsubmit: fn()
		}
	});
</script>

<!--
This is an example story for the `ValidatedForm` component, demonstrating its usage with various `ValidatedInput` fields
and validation rules.
The component makes sure the form is not submitted as a _POST_ directly.
It validates all child `ValidatedInput` components before allowing submission.
On submit all children are touched to show validation errors even if the input field wasn't touched by the user before.
It focuses the first invalid input field if validation fails.

To test the behavior, press the "submit" button to see that all invalid fields show their error message.
-->

{#snippet render(args)}
	<ValidatedForm {...args}>
		{args.children}
		<div class="flex flex-col gap-6">
			<ValidatedInput id="noValidation" label="No Validation"></ValidatedInput>
			<ValidatedInput
				id="email"
				label="Email"
				type="email"
				validations={[(v) => (v && v.includes('@') ? null : 'Email is required')]}
			></ValidatedInput>
			<ValidatedInput
				id="minLength"
				label="Min. Length"
				validations={[(v) => (!v || v.length < 6 ? 'Min. length 6' : null)]}
			></ValidatedInput>
			<ValidatedInput id="required" label="Required" required></ValidatedInput>

			<input type="submit" value="Submit" />
		</div>
	</ValidatedForm>
{/snippet}

<Story name="Validated Form" args={{ id: 'default' }} />
