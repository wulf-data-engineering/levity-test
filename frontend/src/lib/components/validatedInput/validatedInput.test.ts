import { render, waitFor } from '@testing-library/svelte';
import { expect, describe, it } from 'vitest';

import { ValidatedInput } from '.';

describe('validated input', () => {
	it('plain input', () => {
		render(ValidatedInput, { id: 'foo' });

		const input = document.getElementById('foo');
		expect(input).not.toHaveAttribute('type');
	});

	it('passes attributes to actual input', () => {
		render(ValidatedInput, { id: 'foo', type: 'email', autocorrect: 'off' });

		const input = document.getElementById('foo');
		expect(input).toHaveAttribute('type', 'email');
		expect(input).toHaveAttribute('autocorrect', 'off');
	});

	it('indicates native validation error', () => {
		render(ValidatedInput, { id: 'foo', type: 'email', required: true });

		const input = document.getElementById('foo') as HTMLInputElement;
		expect(input.reportValidity()).toBeFalsy();
		expect(input).toHaveAttribute('required');

		waitFor(() => {
			expect(input).toHaveAttribute('aria-invalid', 'true');
		});
	});

	it('indicates native validation error on blur', () => {
		render(ValidatedInput, { id: 'foo', type: 'email', required: true });

		const input = document.getElementById('foo') as HTMLInputElement;
		expect(input).toHaveAttribute('required');

		input.focus();
		input.blur();

		waitFor(() => {
			expect(input).toHaveAttribute('aria-invalid', 'true');
		});
	});

	it('indicates custom validation error on blur', () => {
		render(ValidatedInput, {
			id: 'foo',
			type: 'email',
			validations: [(v) => (v.includes('@') ? undefined : 'No @')]
		});

		const input = document.getElementById('foo') as HTMLInputElement;

		input.focus();
		input.blur();

		waitFor(() => {
			expect(input).toHaveAttribute('aria-invalid', 'true');
			expect(input).toHaveAttribute('aria-describedby');
			const message = document.getElementById(input.getAttribute('aria-describedby')!);
			expect(message).toHaveTextContent('No @');
		});
	});

	it('indicates custom validation error continuously after first blur', () => {
		render(ValidatedInput, {
			id: 'foo',
			type: 'email',
			validations: [(v) => (v.includes('@') ? undefined : 'No @')]
		});

		const input = document.getElementById('foo') as HTMLInputElement;

		input.value = '@';
		input.focus();
		input.blur();

		waitFor(() => {
			expect(input).toHaveAttribute('aria-invalid', 'false');
		});

		input.value = 'at';

		waitFor(() => {
			expect(input).toHaveAttribute('aria-invalid', 'true');
			expect(input).toHaveAttribute('aria-describedby');
			const message = document.getElementById(input.getAttribute('aria-describedby')!);
			expect(message).toHaveTextContent('No @');
		});
	});

	it('show label and informational text overridden by error', () => {
		render(ValidatedInput, {
			id: 'foo',
			label: 'Foo',
			info: 'Foo text',
			type: 'email',
			validations: [(v) => (v.includes('@') ? undefined : 'No @')]
		});

		const input = document.getElementById('foo') as HTMLInputElement;

		const label = document.querySelector('label[for=foo]');
		expect(label).toHaveTextContent('Foo');

		expect(input).toHaveAttribute('aria-describedby');
		const message = document.getElementById(input.getAttribute('aria-describedby')!);
		expect(message).toHaveTextContent('Foo text');

		input.value = '@';
		input.focus();
		input.blur();

		input.value = 'at';

		waitFor(() => {
			expect(input).toHaveAttribute('aria-invalid', 'true');
			expect(message).toHaveTextContent('No @');
		});
	});
});
