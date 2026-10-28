<script lang="ts">
	import { animate } from 'motion';
	import { swapOut } from '../alert/swap';
	import { isReducedMotion, motionTokens } from '../motion';

	let { text }: { text: string } = $props();

	const { blur, duration, stagger } = motionTokens;
	const WORD_RISE = '0.3em';

	const parts = $derived(text.split(/(\s+)/));
	let linesShown = 0;

	/** A new status replaces the whole line: the old one lifts away quickly while the new words rise in one after another. */
	function riseWords(line: HTMLElement) {
		const isFirstLine = linesShown++ === 0;
		if (isFirstLine || isReducedMotion()) return;
		animate(
			line.querySelectorAll('.word'),
			{
				opacity: [0, 1],
				y: [WORD_RISE, '0em'],
				filter: [`blur(${blur.soft}px)`, 'blur(0px)']
			},
			{
				duration: duration.standard,
				ease: motionTokens.ease.enter,
				delay: (index: number) => (index / 2) * stagger.word
			}
		);
	}
</script>

<span class="status" role="status">
	<span class="sr-only">{text}</span>
	<span class="roll" aria-hidden="true">
		{#key text}
			<span class="line" {@attach riseWords} out:swapOut>
				{#each parts as part, index (index)}<span class="word">{part}</span>{/each}
			</span>
		{/key}
	</span>
</span>

<style>
	.status {
		position: relative;
		overflow: clip visible;
		color: var(--arc-text-muted);
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	/* The line clips sideways only, so a status too long for its column ends in an ellipsis while its words still rise in unclipped. */
	.roll {
		position: relative;
		display: block;
	}
	.line {
		display: block;
		overflow: clip visible;
		text-overflow: ellipsis;
	}
	.word {
		display: inline-block;
		white-space: pre;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
