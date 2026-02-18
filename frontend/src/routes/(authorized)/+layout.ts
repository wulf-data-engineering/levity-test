import { redirect } from '@sveltejs/kit';
import { configureAuth, currentUser } from '$lib/auth';
import { get } from 'svelte/store';

import type { CurrentUser } from '$lib/auth';
import { loadUserProfile } from '$lib/api/user-profile';
import type { UserProfile } from '$lib/proto/user_profile/user_profile';

export const prerender = false;
export const ssr = false;

export async function load({ url }): Promise<{ currentUser: CurrentUser; userProfile: UserProfile }> {
	await configureAuth();
	if (get(currentUser)) {
		const userProfile = await loadUserProfile();
		return { currentUser: get(currentUser), userProfile };
	} else {
		redirect(303, `/?redirectTo=${url.pathname}`);
	}
}
