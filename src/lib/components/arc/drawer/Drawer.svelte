<script module lang="ts">
	import type { Snippet } from 'svelte';

	export type DrawerProps = {
		open?: boolean;
		defaultOpen?: boolean;
		onOpenChange?: (open: boolean) => void;
		children?: Snippet;
	};
</script>

<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { setDrawerContext } from './context';

	let {
		defaultOpen = false,
		open = $bindable(defaultOpen),
		onOpenChange,
		children
	}: DrawerProps = $props();

	// A drag that dismisses the panel hands its velocity to the exit spring; every other close uses the shorter tween.
	let flung = $state(false);

	function setOpen(next: boolean) {
		flung = false;
		open = next;
		onOpenChange?.(next);
	}

	setDrawerContext({
		get open() {
			return open;
		},
		get flung() {
			return flung;
		},
		setOpen,
		fling() {
			setOpen(false);
			flung = true;
		}
	});
</script>

<Dialog.Root bind:open={() => open, setOpen}>
	{@render children?.()}
</Dialog.Root>
