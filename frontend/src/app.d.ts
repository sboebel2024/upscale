// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

declare namespace svelteHTML {
	interface HTMLAttributes<T> {
	  // Add missing event attributes
	  onmouseenter?: (event: MouseEvent) => void;
	  onmouseleave?: (event: MouseEvent) => void;
	  onmousemove?: (event: MouseEvent) => void;
	}
}

export {};
