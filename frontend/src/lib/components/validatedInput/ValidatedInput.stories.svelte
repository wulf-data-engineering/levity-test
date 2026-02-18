<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { ValidatedInput } from '.';

	const { Story } = defineMeta({
		title: 'Example/ValidatedInput',
		component: ValidatedInput,
		tags: ['autodocs'],
		args: {
			placeholder: 'Type something...'
		}
	});
</script>

<!--
The `ValidatedInput` component is an extension of shadcn/svelte's `Input` component that adds an optional label,
validation capabilities and an optional informational text.
It accepts an array of validation functions via the `validations` prop, which are executed to determine the validity of
the input value. Returning `undefined` or `null` from a validation function indicates that the value is valid, while
returning a string indicates an error message. An empty string will raise invalidation but keep showing the basic `info`
message or no message at all.

Validation errors are displayed below the input field, replacing the informational text if present.
They are just shown when the input field has been touched (focused and blurred) once or when a parent `ValidatedForm` is
submitted once.
-->

<Story name="Default" args={{ id: 'default' }} />

<Story name="Labeled" args={{ id: 'label', label: 'Label' }} />

<Story name="Info" args={{ id: 'info', info: "We'll never share your Email address." }} />

<Story name="Required" args={{ id: 'required', required: true }} />

<Story
	name="Validated"
	args={{
		id: 'validated',
		validations: [(v) => (!v || !v.includes('@') ? 'Email address required.' : '')]
	}}
/>

<Story
	name="Complete"
	args={{
		id: 'complete',
		label: 'Email',
		info: "We'll never share your Email address.",
		validations: [(v) => (!v || !v.includes('@') ? 'Email address required.' : '')]
	}}
/>
