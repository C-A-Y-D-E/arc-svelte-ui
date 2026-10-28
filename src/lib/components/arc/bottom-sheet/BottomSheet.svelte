<script module lang="ts">
	import type { Snippet } from 'svelte';
	import type { SheetProps } from './Sheet.svelte';

	/**
	 * A sheet that rises from the bottom edge and rests at one or more heights (detents).
	 * Use it for secondary tasks where a peek is useful before committing to the full view: trip details, share options, filters.
	 * Use a dialog when the decision must interrupt, and a drawer for side panels on wide layouts.
	 */
	export type BottomSheetProps = SheetProps & {
		/** The control that opens the sheet, usually a button. Spread `props` onto it; focus returns to it when the sheet closes. */
		trigger?: Snippet<[{ props: Record<string, unknown> }]>;
		open?: boolean;
		defaultOpen?: boolean;
		onOpenChange?: (open: boolean) => void;
	};
</script>

<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { untrack } from 'svelte';
	import Sheet from './Sheet.svelte';

	let {
		trigger,
		defaultOpen = false,
		open = $bindable(defaultOpen),
		onOpenChange,
		...sheetProps
	}: BottomSheetProps = $props();

	let rendered = $state(untrack(() => open));

	$effect.pre(() => {
		if (open) rendered = true;
	});

	function setOpen(next: boolean) {
		open = next;
		onOpenChange?.(next);
	}

	function finishExit() {
		if (!open) rendered = false;
	}
</script>

<Dialog.Root bind:open={() => open, setOpen}>
	{#if trigger}
		<Dialog.Trigger>
			{#snippet child({ props })}
				{@render trigger({ props })}
			{/snippet}
		</Dialog.Trigger>
	{/if}
	<!-- The sheet stays mounted while it leaves, so a close can be caught and reversed mid-flight. -->
	{#if rendered}
		<Dialog.Portal>
			<Sheet
				{...sheetProps}
				present={open}
				onDismiss={() => setOpen(false)}
				onExitComplete={finishExit}
			/>
		</Dialog.Portal>
	{/if}
</Dialog.Root>
