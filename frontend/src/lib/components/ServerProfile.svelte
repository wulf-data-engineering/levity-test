<script lang="ts">
  import { serverClient } from '$lib/server-client';
  import { onMount } from 'svelte';
  import type { UserProfile } from '$lib/proto/user_profile/user_profile_pb';

  let profile: UserProfile | null = null;
  let loading = true;
  let error: string | null = null;

  async function fetchProfile() {
    try {
      loading = true;
      // Using the ConnectRPC client
      profile = await serverClient.getProfile({ userId: '123' });
    } catch (e) {
      console.error('Failed to fetch profile from ECS server:', e);
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(fetchProfile);
</script>

<div class="p-6 bg-slate-900/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl text-white shadow-2xl">
  <h2 class="text-2xl font-bold mb-4 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
    ECS Server Profile
  </h2>

  {#if loading}
    <div class="flex items-center space-x-2 animate-pulse">
      <div class="w-4 h-4 bg-cyan-500 rounded-full"></div>
      <span class="text-slate-400 italic">Fetching from ECS server...</span>
    </div>
  {:else if error}
    <div class="p-4 bg-red-900/20 border border-red-500/50 rounded-xl text-red-400">
      <p class="font-semibold">Error:</p>
      <p class="text-sm opacity-80">{error}</p>
    </div>
  {:else if profile}
    <div class="space-y-3">
      <div class="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
        <span class="text-slate-400 text-sm">First Name</span>
        <span class="font-medium text-cyan-300">{profile.firstName}</span>
      </div>
      <div class="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
        <span class="text-slate-400 text-sm">Last Name</span>
        <span class="font-medium text-cyan-300">{profile.lastName}</span>
      </div>
      <button
        on:click={fetchProfile}
        class="mt-4 w-full py-2 px-4 bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 rounded-lg transition-all active:scale-[0.98] font-semibold text-sm shadow-lg shadow-cyan-900/20"
      >
        Refresh Profile
      </button>
    </div>
  {/if}
</div>
