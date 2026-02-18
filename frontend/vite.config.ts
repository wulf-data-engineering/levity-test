import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import protoPlugin from './vite-plugin-protobuf';
import { svelteTesting } from '@testing-library/svelte/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), svelteTesting(), protoPlugin()],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'jsdom',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					setupFiles: ['./vitest-setup.js']
				}
			}
		]
	},
	server: {
		proxy: {
			// On dev redirect "/api/..." to cargo lambda watch "/lambda-url/.../"
			'/api': {
				target: 'http://localhost:9000',
				changeOrigin: true,
				secure: false,
				rewrite: (path) => {
					const withoutApi = path.replace(/^\/api/, '');
					return `/lambda-url${withoutApi}/`;
				}
			}
		}
	}
});
