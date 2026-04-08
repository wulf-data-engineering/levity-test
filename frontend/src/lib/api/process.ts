import { protocolRequest } from '$lib/protocols';
import { ProcessRequest, ProcessResponse } from '$lib/proto/process/process';
import { get } from 'svelte/store';
import { authApi } from '$lib/auth';

export async function createProcess(input: string): Promise<ProcessResponse> {
    const session = await get(authApi).fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    
    if (!token) {
        throw new Error('No auth token available');
    }

    const request: ProcessRequest = {
        createProcess: {
            input
        }
    };


    return await protocolRequest('/api/process', request, ProcessRequest, ProcessResponse, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`
        }
    });
}
