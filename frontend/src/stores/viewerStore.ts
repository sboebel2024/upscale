import { writable } from "svelte/store";

// This store will trigger the mesh removal
export const clearViewer = writable(false);
export const forceReload = writable(0);
