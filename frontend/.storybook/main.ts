import type { StorybookConfig } from '@storybook/sveltekit';

const config: StorybookConfig = {
	framework: '@storybook/sveltekit',
	stories: ['../src/**/*.stories.@(js|ts|svelte)'],
	staticDirs: ['../src/lib/assets'],
	addons: ['@storybook/addon-svelte-csf', '@storybook/addon-docs']
};

export default config;
