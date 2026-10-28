<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { setTabsContext, type TabsContext } from './tabs-context';

	type Props = Omit<TabsPrimitive.RootProps, 'child'> & { defaultValue?: string };

	let {
		defaultValue = '',
		value = $bindable(defaultValue),
		onValueChange,
		ref = $bindable(null),
		class: className,
		children,
		...rest
	}: Props = $props();

	let direction = $state(1);

	const context: TabsContext = {
		get active() {
			return value;
		},
		get direction() {
			return direction;
		},
		get root() {
			return ref;
		},
		panelHeight: null,
		leavingRect: null
	};
	setTabsContext(context);

	function tabOrder(root: HTMLElement) {
		return Array.from(root.querySelectorAll<HTMLElement>('[role="tab"][data-value]'))
			.filter((tab) => tab.closest('[data-arc-tabs]') === root)
			.map((tab) => tab.dataset.value);
	}

	function changeValue(next: string) {
		if (ref) {
			context.leavingRect =
				ref
					.querySelector(':scope > [role="tabpanel"][data-state="active"]')
					?.getBoundingClientRect() ?? null;
			const order = tabOrder(ref);
			const from = order.indexOf(value);
			const to = order.indexOf(next);
			if (from >= 0 && to >= 0 && from !== to) direction = to > from ? 1 : -1;
		}
		value = next;
		onValueChange?.(next);
	}
</script>

<TabsPrimitive.Root bind:value={() => value, changeValue} {...rest}>
	{#snippet child({ props })}
		<div {...props} bind:this={ref} class={['root', className]} data-arc-tabs>
			{@render children?.()}
		</div>
	{/snippet}
</TabsPrimitive.Root>

<style>
	/* Positioned so an outgoing panel pops out exactly where it was while the next one takes its place. */
	.root {
		position: relative;
	}
</style>
