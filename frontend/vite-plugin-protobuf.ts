import { execSync } from 'child_process';
import type { Plugin } from 'vite';

export default function protoPlugin(): Plugin {
	return {
		name: 'vite-plugin-proto',
		// Runs before build starts (both dev and prod)
		buildStart() {
			console.log('[proto] generating TypeScript from .proto files...');
			execSync('npm run gen:proto', { stdio: 'inherit' });
		}
	};
}
