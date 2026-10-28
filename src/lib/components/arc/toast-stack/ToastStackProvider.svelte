<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { provideToastStore } from './toast-store.svelte';

	type Props = {
		/** Subtree that can raise toasts. */
		children: Snippet;
		/** Base lifetime in milliseconds. Warnings and errors stay 1.6 times longer. */
		duration?: number;
		/** Oldest toasts beyond this count are dropped from the queue. */
		limit?: number;
	};

	let { children, duration = 5000, limit = 12 }: Props = $props();

	// Created once, like a React state initializer; later prop changes do not rebuild the queue.
	untrack(() => provideToastStore(duration, limit));
</script>

{@render children()}
