import { protocolLoad } from '$lib/protocols';
import { UserProfile } from '$lib/proto/user_profile/user_profile';
import { get } from 'svelte/store';
import { authApi } from '$lib/auth';

export async function loadUserProfile(): Promise<UserProfile> {
    const session = await get(authApi).fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    
    if (!token) {
        throw new Error('No auth token available');
    }

    return await protocolLoad('/api/user-profile', UserProfile, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });
}
