<!-- A number that counts to each new value, written straight to the DOM so no frame re-renders the component. Whole targets count in whole steps. -->
<script lang="ts">
	import { animate, motionValue } from 'motion';
	import { untrack } from 'svelte';
	import { isReducedMotion } from '../motion';
	import { physicalSpring } from '../sparkline/chart-kit';

	let { value, format }: { value: number; format: (value: number) => string } = $props();

	const COUNT_SPRING = { visualDuration: 0.4, bounce: 0 };
	/** Rest within a thousandth of the distance travelled, so small and large counts settle alike. */
	const REST_FRACTION = 0.001;
	const MIN_REST_DELTA = 1e-6;

	let node: HTMLSpanElement;
	const initialText = untrack(() => format(value));
	const counted = motionValue(untrack(() => value));
	let target = untrack(() => value);

	const display = (now: number) => format(Number.isInteger(target) ? Math.round(now) : now);

	$effect(() => {
		const unsubscribe = counted.on('change', (now) => (node.textContent = display(now)));
		return () => {
			unsubscribe();
			counted.destroy();
		};
	});

	$effect(() => {
		const next = value;
		const text = format(next);
		const reduced = isReducedMotion();
		untrack(() => {
			if (target === next && !reduced) {
				if (!counted.isAnimating()) node.textContent = text;
				return;
			}
			target = next;
			if (reduced) {
				counted.jump(next);
				node.textContent = text;
				return;
			}
			const restDelta = Math.max(Math.abs(next - counted.get()) * REST_FRACTION, MIN_REST_DELTA);
			animate(counted, next, physicalSpring(COUNT_SPRING, restDelta));
		});
	});
</script>

<span bind:this={node}>{initialText}</span>
