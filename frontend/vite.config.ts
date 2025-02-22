import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		tailwindcss(),
	],
	optimizeDeps: {
		include: ["three-cad-viewer"], // Force Vite to optimize this dependency
	},
	build: {
		commonjsOptions: {
			include: [/three-cad-viewer/, /node_modules/], // Ensure compatibility
		},
	},
	ssr: {
		noExternal: ['monaco-editor'] // Prevent SSR from processing monaco-editor
	}
});
