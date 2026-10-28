<script lang="ts">
	import { ease, motionTokens, presence } from '../motion';
	import { closeRow, followCopyHeight, openRow } from './message-row';
	import MotionText from './MotionText.svelte';

	type Props = {
		id?: string;
		text?: string;
		tone?: 'hint' | 'error';
		/** Announces the copy through role="alert". */
		alert?: boolean;
		rollNumbers?: boolean;
	};

	let { id, text, tone = 'hint', alert = false, rollNumbers = true }: Props = $props();

	/** About .35em of the small helper copy. */
	const COPY_RISE_PX = 4;
	const { blur } = motionTokens;
</script>

<!-- Helper and error copy: the row opens its height on a spring, then the words settle in. -->
{#if text}
	<span class="message-slot" {@attach followCopyHeight} in:openRow out:closeRow>
		<span
			{id}
			class={['message', tone]}
			role={alert ? 'alert' : undefined}
			in:presence={{ opacity: 1, y: COPY_RISE_PX, blur: blur.soft, easing: ease.enter }}
		>
			<MotionText {text} {rollNumbers} />
		</span>
	</span>
{/if}

<style>
	/* The row's space is padding inside the clipped slot, so the height animates from a true zero. */
	.message-slot {
		display: block;
		overflow: hidden;
	}
	.message {
		display: block;
		padding-top: var(--arc-space-2);
		font-size: var(--arc-text-xs);
		line-height: var(--arc-leading-body);
	}
	.hint {
		color: var(--arc-text-muted);
	}
	.error {
		color: var(--arc-danger);
	}
</style>
