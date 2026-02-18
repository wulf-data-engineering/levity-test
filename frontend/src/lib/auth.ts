import {writable, derived, get} from 'svelte/store';

import {dev} from '$app/environment';
import type {Amplify} from 'aws-amplify';
import type {GetCurrentUserOutput} from 'aws-amplify/auth';
import type * as Auth from 'aws-amplify/auth';
import {SignUpData} from '$lib/proto/sign_up_data/sign_up_data';

export type Amplify = typeof Amplify;
export type AuthApi = typeof Auth;

// Holds the Auth namespace once the client loads Amplify
export const amplify = writable<Amplify>(undefined);
export const authApi = writable<AuthApi>(undefined);

// Tri-state user: value (signed in), null (signed out), undefined (loading)
export type CurrentUser = GetCurrentUserOutput | null | undefined;
export const currentUser = writable<CurrentUser>(undefined);

// Handy derived helpers
export const isSignedIn = derived(currentUser, (u) => !!u);
export const isSignedOut = derived(currentUser, (u) => u === null);
export const isLoadingUser = derived(currentUser, (u) => u === undefined);

let configured = false;

type Config = {
    userPoolId: string;
    userPoolClientId: string;
    endpoint?: string;
};

/**
 * Configure Amplify Auth from /config.json (AWS) or environment variables (dev, defaults to local
 * Cognito mock values).
 * Provides the configured Amplify and Auth namespaces via Svelte stores.
 * Called in onMount of the base layout.
 */
export async function configureAuth() {
    if (configured) return;

    async function loadConfig(): Promise<Config> {
        if (dev) {
            return {
                userPoolId: import.meta.env.VITE_USER_POOL_ID || 'local_userPool',
                userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID || 'local_userPoolClient',
                endpoint: import.meta.env.VITE_COGNITO_ENDPOINT || 'http://localhost:9229'
            };
        } else {
            const response = await fetch('/config.json');
            if (!response.ok) throw new Error(`Failed to load config: ${response.statusText}`);
            return await response.json();
        }
    }

    const {userPoolId, userPoolClientId, endpoint} = await loadConfig();

    const importedAmplify: Amplify = (await import('aws-amplify')).Amplify;
    const importedAuthApi: AuthApi = await import('aws-amplify/auth');

    importedAmplify.configure(
        {
            Auth: {
                Cognito: {
                    userPoolId,
                    userPoolClientId,
                    userPoolEndpoint: endpoint
                }
            }
        },
        {ssr: false}
    );

    amplify.set(importedAmplify);
    authApi.set(importedAuthApi);

    await loadCurrentUser();

    configured = true;
    console.log('[auth] Amplify configured', {userPoolId, userPoolClientId, endpoint});
}

export async function loadCurrentUser() {
    try {
        currentUser.set(await get(authApi).getCurrentUser());
    } catch {
        currentUser.set(null);
    }
}

async function performAutoSignIn() {
    await get(authApi).autoSignIn();
    await loadCurrentUser();
}

/**
 * Signs up the user with given credentials and sign-up data.
 * If there is a current user, they are signed out first.
 */
export async function signUp(
    email: string,
    password: string,
    autoSignIn: boolean = true
) {
    if (get(isSignedIn)) await signOut();

    const result = await get(authApi).signUp({
        username: email,
        password: password,
        options: {
            userAttributes: {
                email: email
            },
            autoSignIn
        }
    });
    return result;
}

/**
 * Confirms user sign up with given OTP code.
 * If confirmation completes with auto signs in in production, the user is also signed in.
 */
export async function confirmSignUp(email: string, otp: string, signUpData: SignUpData) {
    const result = await get(authApi).confirmSignUp({
        username: email,
        confirmationCode: otp,
        options: {
            clientMetadata: {
                sign_up_data: JSON.stringify(signUpData)
            }
        }
    });
  if (!result.isSignUpComplete) {
        console.warn('User is not completely signed up in after confirm:', result.nextStep);
    } else if (result.nextStep.signUpStep === 'COMPLETE_AUTO_SIGN_IN') {
        if (!dev /* not supported in Cognito local */) {
            await performAutoSignIn();
        }
    }
    return result;
}

/**
 * Signs in the user with given credentials.
 */
export async function signIn(username: string, password: string) {
    const user = await get(authApi).signIn({
        username: username,
        password: password,
        options: {
            authFlowType: dev ? 'USER_PASSWORD_AUTH' : 'USER_SRP_AUTH'
        }
    });
    if (!user.isSignedIn) {
        console.warn('User is not signed in after signIn:', user.nextStep);
    } else {
        await loadCurrentUser();
    }
    return user;
}

/**
 * Signs out the current user.
 */
export async function signOut() {
    await get(authApi).signOut({global: false});
    currentUser.set(null);
}
