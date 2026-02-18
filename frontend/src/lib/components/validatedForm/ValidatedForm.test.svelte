<script lang="ts">
	import { ValidatedForm } from '.';
	import { ValidatedInput } from '../validatedInput';
	import { Button } from '../ui/button';

	let submitted = false;

	function handleSubmit() {
		submitted = false;
	}
</script>

<ValidatedForm id="form" onsubmit={handleSubmit}>
	<ValidatedInput id="firstName" label="First Name" />
	<ValidatedInput id="lastName" label="Last Name" required />
	<ValidatedInput
		id="email"
		label="Email"
		validations={[(v) => (v.includes('@') ? undefined : 'No @')]}
	/>
	<Button type="submit" />
	<p data-test-id="submitted">{submitted ? 'true' : 'false'}</p>
</ValidatedForm>
