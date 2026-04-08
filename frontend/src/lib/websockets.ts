import { loadConfig } from '$lib/config';

export async function getWebSocketUrl(): Promise<string> {
    const config = await loadConfig();
    return config.webSocketUrl || '';
}
