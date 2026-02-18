<script lang="ts">
    import { authApi, signIn } from '$lib/auth';
    import { goto } from '$app/navigation';
    import { Button } from '$lib/components/ui/button';
    import * as Card from '$lib/components/ui/card';
    import { toastError, toastSuccess } from '../toasts';
    import { dev } from '$app/environment';
    import * as InputOTP from '$lib/components/ui/input-otp';
    import { get } from 'svelte/store';
    import { requestPasswordReset } from '../resetPassword/request';
    import { page } from '$app/state';
    import { validateEmail, validateNewPassword, validatePasswordRepetition } from '$lib/validation';
    import { ValidatedInput } from '$lib/components/validatedInput';
    import { ValidatedForm } from '$lib/components/validatedForm';
    import { onMount } from 'svelte';
    import { protocolLoad } from '$lib/protocols';
    import { PasswordPolicy } from '$lib/proto/password_policy/password_policy';

    let email = $state('');
    let password = $state('');
    let confirm = $state('');

    let otp = $state(dev ? '123456' : ''); // erased at build time

    let submitting = $state(false);

    let passwordPolicy: PasswordPolicy | null = $state(null);

    onMount(() => {
        const urlEmail = page.url.searchParams.get('email');
        if (urlEmail) {
            email = urlEmail;
        }

        const urlOtp = page.url.searchParams.get('otp');
        if (urlOtp) {
            otp = urlOtp;
        }

        protocolLoad('/api/password-policy', PasswordPolicy)
            .then((data) => {
                passwordPolicy = data;
            })
            .catch((err) => {
                console.error('Error loading password policy:', err);
            });
    });

    async function handleSubmit(e: Event) {
        e.preventDefault();
        submitting = true;
        try {
            await get(authApi).confirmResetPassword({
                username: email,
                newPassword: password,
                confirmationCode: otp
            });
            toastSuccess('Password Reset', 'Your password has been reset successfully.');
            await signIn(email, password);
            await goto('/');
        } catch (err) {
            console.error('Error confirming reset password:', err);
            if (err instanceof Error && err.name === 'CodeMismatchException') {
                toastError('Password Reset', 'The provided confirmation code is incorrect.');
            } else if (err instanceof Error && err.name === 'ExpiredCodeException') {
                try {
                    await get(authApi).resetPassword({ username: email });
                    toastError(
                        'Code Sent',
                        'The provided confirmation code has expired. A new confirmation code has been sent to your email.'
                    );
                } catch {
                    toastError('Password Reset', 'The provided confirmation code has expired.');
                }
            } else toastError('Password Reset', 'Password reset failed.');
        } finally {
            submitting = false;
        }
    }

    async function resendCode() {
        try {
            submitting = true;
            await requestPasswordReset(email);
        } finally {
            submitting = false;
        }
    }
</script>

<Card.Root class="m-auto mt-5 w-full max-w-sm">
    <Card.Header>
        <Card.Title>Reset Password</Card.Title>
        <Card.Description>Enter the code you received and the new password</Card.Description>
    </Card.Header>

    <Card.Content>
        <ValidatedForm id="form" onsubmit={handleSubmit}>
            <div class="flex flex-col gap-6">
                <InputOTP.Root id="otp" maxlength={6} bind:value={otp} class="justify-center" required>
                    {#snippet children({ cells })}
                        <InputOTP.Group>
                            {#each cells as cell (cell)}
                                <InputOTP.Slot {cell} />
                            {/each}
                        </InputOTP.Group>
                    {/snippet}
                </InputOTP.Root>

                <ValidatedInput
                        id="email"
                        label="Email"
                        type="email"
                        bind:value={email}
                        validations={[validateEmail]}
                />

                <ValidatedInput
                        id="password"
                        label="Password"
                        type="password"
                        bind:value={password}
                        data-policy={passwordPolicy ? 'true' : 'false'}
                        validations={[(v) => validateNewPassword(v, passwordPolicy)]}
                />

                <ValidatedInput
                        id="confirm"
                        label="Confirm"
                        type="password"
                        bind:value={confirm}
                        validations={[(v) => validatePasswordRepetition(password, v)]}
                />
            </div>
        </ValidatedForm>
    </Card.Content>

    <Card.Footer class="flex-col gap-2">
        <Button
                id="reset-password-btn"
                variant="default"
                disabled={submitting}
                class="w-full"
                type="submit"
                form="form"
        >
            Reset Password
        </Button>
        <Button
                id="resend-code-btn"
                variant="outline"
                disabled={submitting}
                class="w-full"
                onclick={resendCode}
        >
            Resend Code
        </Button>
    </Card.Footer>
</Card.Root>
