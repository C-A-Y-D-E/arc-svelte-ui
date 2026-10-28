<script module lang="ts">
	import type { Snippet } from 'svelte';

	export type AccordionItem = { title: string; content: string | Snippet };
	export type AccordionSize = 'md' | 'lg';
</script>

<script lang="ts">
	import { Accordion as AccordionPrimitive } from 'bits-ui';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { animate } from 'motion';
	import { untrack } from 'svelte';
	import { isReducedMotion, motionTokens } from '../motion';

	type Props = {
		items: AccordionItem[];
		defaultOpen?: number;
		/** "lg" suits page-level FAQs: questions at the large text size, answers at body size. */
		size?: AccordionSize;
	};

	let { items, defaultOpen = 0, size = 'md' }: Props = $props();

	const { blur, duration, spring } = motionTokens;
	const CONTENT_LIFT_PX = -6;
	const STILL = { duration: 0 };
	const ROTATION_OPEN = 180;

	const initialValue = untrack(() =>
		defaultOpen >= 0 && defaultOpen < items.length ? String(defaultOpen) : ''
	);
	let openValue = $state(initialValue);

	const icons: HTMLElement[] = $state([]);
	const panels: HTMLElement[] = $state([]);
	const contents: HTMLElement[] = $state([]);

	/** Height follows the content on a spring that never overshoots; closed panels leave the accessibility tree once they finish collapsing. */
	function movePanel(index: number, open: boolean, instant: boolean) {
		const panel = panels[index];
		if (open) panel.style.visibility = 'visible';
		const target = { height: open ? contents[index].offsetHeight : 0, opacity: open ? 1 : 0 };
		const transition = instant
			? STILL
			: {
					height: spring.smooth,
					opacity: open
						? { duration: duration.standard, ease: motionTokens.ease.enter }
						: { duration: duration.fast, ease: motionTokens.ease.standard }
				};
		animate(panel, target, transition).then(() => settlePanel(index, open));
	}

	function settlePanel(index: number, open: boolean) {
		if ((openValue === String(index)) !== open) return;
		if (open) {
			panels[index].style.height = 'auto';
			contents[index].style.filter = 'none';
		} else {
			panels[index].style.visibility = 'hidden';
		}
	}

	/** The answer settles down into place with a brief focus pull as the panel opens. */
	function moveContent(index: number, open: boolean, instant: boolean) {
		const target = open
			? { y: 0, filter: 'blur(0px)' }
			: { y: CONTENT_LIFT_PX, filter: `blur(${blur.subtle}px)` };
		const transition = instant
			? STILL
			: open
				? {
						y: spring.smooth,
						filter: { duration: duration.standard, ease: motionTokens.ease.enter }
					}
				: { duration: duration.fast, ease: motionTokens.ease.standard };
		animate(contents[index], target, transition);
	}

	function rotateIcon(index: number, open: boolean, instant: boolean) {
		animate(icons[index], { rotate: open ? ROTATION_OPEN : 0 }, instant ? STILL : spring.snappy);
	}

	// Motion owns the height, so a toggle mid-flight retargets instead of restarting.
	let renderedValue: string | null = null;
	$effect(() => {
		const instant = renderedValue === null || isReducedMotion();
		items.forEach((_, index) => {
			const key = String(index);
			const open = openValue === key;
			if (renderedValue !== null && (renderedValue === key) === open) return;
			rotateIcon(index, open, instant);
			movePanel(index, open, instant);
			moveContent(index, open, instant);
		});
		renderedValue = openValue;
	});
</script>

<AccordionPrimitive.Root type="single" bind:value={openValue}>
	{#snippet child({ props })}
		<div {...props} class={['accordion', size === 'lg' && 'lg']}>
			{#each items as item, index (`${item.title}-${index}`)}
				{@const initiallyOpen = initialValue === String(index)}
				<AccordionPrimitive.Item value={String(index)}>
					{#snippet child({ props })}
						<div {...props} class="item">
							<AccordionPrimitive.Header level={3}>
								{#snippet child({ props })}
									<h3 {...props} class="header">
										<AccordionPrimitive.Trigger>
											{#snippet child({ props })}
												<button {...props} class="trigger">
													<span>{item.title}</span>
													<span bind:this={icons[index]} class="icon">
														<ChevronDownIcon size={17} aria-hidden="true" />
													</span>
												</button>
											{/snippet}
										</AccordionPrimitive.Trigger>
									</h3>
								{/snippet}
							</AccordionPrimitive.Header>
							<AccordionPrimitive.Content forceMount>
								{#snippet child({ props })}
									<div
										{...props}
										bind:this={panels[index]}
										class="panel"
										style:height={initiallyOpen ? undefined : '0px'}
										style:opacity={initiallyOpen ? undefined : '0'}
										style:visibility={initiallyOpen ? undefined : 'hidden'}
									>
										<div bind:this={contents[index]} class="panel-inner">
											{#if typeof item.content === 'string'}{item.content}{:else}{@render item.content()}{/if}
										</div>
									</div>
								{/snippet}
							</AccordionPrimitive.Content>
						</div>
					{/snippet}
				</AccordionPrimitive.Item>
			{/each}
		</div>
	{/snippet}
</AccordionPrimitive.Root>

<style>
	.accordion {
		width: 100%;
		border-top: 1px solid var(--arc-border);
	}
	.item {
		border-bottom: 1px solid var(--arc-border);
	}
	.header {
		margin: 0;
	}
	.trigger {
		display: flex;
		width: 100%;
		min-height: var(--arc-control-height-lg);
		align-items: center;
		justify-content: space-between;
		gap: var(--arc-space-5);
		padding: var(--arc-space-2) 0;
		border: 0;
		background: transparent;
		color: var(--arc-foreground);
		font: inherit;
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: var(--arc-leading-body);
		text-align: left;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition: color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	@media (hover: hover) and (pointer: fine) {
		.trigger:hover {
			color: var(--arc-text-secondary);
		}
		.trigger:hover .icon {
			color: var(--arc-foreground);
		}
	}
	.trigger:focus-visible {
		outline: 3px solid var(--arc-focus-ring);
		outline-offset: 3px;
		border-radius: var(--arc-radius-control);
	}
	/* Rotation is driven by a spring in the script; CSS only handles color. */
	.icon {
		display: inline-flex;
		flex: 0 0 auto;
		color: var(--arc-text-muted);
		transition: color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.trigger[data-state='open'] .icon {
		color: var(--arc-foreground);
	}
	.panel {
		overflow: hidden;
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
	}
	.panel-inner {
		overflow-wrap: anywhere;
		padding: 0 var(--arc-space-8) var(--arc-space-5) 0;
	}
	.lg .trigger {
		min-height: 76px;
		gap: var(--arc-space-8);
		padding-block: var(--arc-space-5);
		font-size: var(--arc-text-lg);
		letter-spacing: var(--arc-tracking-body);
	}
	.lg .panel {
		font-size: var(--arc-text-base);
		line-height: 1.65;
	}
	.lg .panel-inner {
		max-width: 62ch;
		padding: 0 var(--arc-space-12) var(--arc-space-6) 0;
	}
	@media (max-width: 520px) {
		.lg .trigger {
			min-height: 68px;
			font-size: var(--arc-text-base);
		}
		.lg .panel {
			font-size: var(--arc-text-sm);
		}
		.lg .panel-inner {
			padding-right: var(--arc-space-6);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.trigger,
		.icon {
			transition: none;
		}
	}
</style>
