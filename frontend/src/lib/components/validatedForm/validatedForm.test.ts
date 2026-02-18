import { render, waitFor } from '@testing-library/svelte';
import { expect, describe, it } from 'vitest';

import TestForm from './ValidatedForm.test.svelte';

describe('validated form', () => {
	it('renders child inputs inside the form', () => {
		const { getByLabelText } = render(TestForm);

		expect(getByLabelText('First Name')).toBeInTheDocument();
		expect(getByLabelText('Last Name')).toBeInTheDocument();
		expect(getByLabelText('Email')).toBeInTheDocument();
	});

	it('validates all child inputs', () => {
		const { getByRole, getByTestId } = render(TestForm);

		expect(getByRole('button')).toBeInTheDocument();
		getByRole('button').click();

		const lastName = document.getElementById('lastName');

		waitFor(() => {
			expect(lastName).toHaveAttribute('aria-invalid', 'true');

			const email = document.getElementById('email')!;
			expect(email).toHaveAttribute('aria-invalid', 'true');
			expect(email).toHaveAttribute('aria-describedby');
			const message = document.getElementById(email.getAttribute('aria-describedby')!);
			expect(message).toHaveTextContent('No @');

			const submitted = getByTestId('submitted');
			expect(submitted).toBeInTheDocument();
			expect(submitted).toHaveTextContent('false');
		});
	});

	it('submits valid child inputs', () => {
		const { getByRole, getByTestId } = render(TestForm);

		expect(getByRole('button')).toBeInTheDocument();

		const lastName = document.getElementById('lastName') as HTMLInputElement;
		lastName.value = 'Tester';
		const email = document.getElementById('email') as HTMLInputElement;
		email.value = 'test@test.de';

		getByRole('button').click();

		waitFor(() => {
			expect(lastName).not.toHaveAttribute('aria-invalid');
			expect(email).not.toHaveAttribute('aria-invalid');

			const submitted = getByTestId('submitted');
			expect(submitted).toBeInTheDocument();
			expect(submitted).toHaveTextContent('true');
		});
	});

	it('submits when child inputs are fixed', () => {
		const { getByRole, getByTestId } = render(TestForm);

		expect(getByRole('button')).toBeInTheDocument();

		const lastName = document.getElementById('lastName') as HTMLInputElement;
		const email = document.getElementById('email') as HTMLInputElement;

		expect(getByRole('button')).toBeInTheDocument();
		getByRole('button').click();

		waitFor(() => {
			expect(lastName).toHaveAttribute('aria-invalid', 'true');

			const submitted = getByTestId('submitted');
			expect(submitted).toBeInTheDocument();
			expect(submitted).toHaveTextContent('false');
		});

		lastName.value = 'Tester';
		email.value = 'test@test.de';
		getByRole('button').click();

		waitFor(() => {
			const submitted = getByTestId('submitted');
			expect(submitted).toBeInTheDocument();
			expect(submitted).toHaveTextContent('true');
		});
	});
});
