import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			fallback: 'fallback.html'
		}),
		prerender: {
			handleHttpError: ({ status, path, referrer, message }) => {
				if (status === 404) {
					// ignore 404s discovered during crawl
					console.log(`Ignoring not found for ${path} from ${referrer} with ${status} ${message}`);
					return;
				}
				// rethrow others
				throw new Error(`Prerender failed for ${path} from ${referrer} with ${status} ${message}`);
			}
		}
	}
};

export default config;
