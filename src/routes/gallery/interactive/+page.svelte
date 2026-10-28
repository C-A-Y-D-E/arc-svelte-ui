<script lang="ts">
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { AnimatedCounter } from '$lib/components/arc/animated-counter';
	import { Button } from '$lib/components/arc/button';
	import { CopyButton } from '$lib/components/arc/copy-button';
	import { HoldToConfirm } from '$lib/components/arc/hold-to-confirm';
	import { InlineEdit } from '$lib/components/arc/inline-edit';
	import { Progress } from '$lib/components/arc/progress';
	import { SlotText } from '$lib/components/arc/slot-text';
	import { Stepper } from '$lib/components/arc/stepper';
	import { TextMorph } from '$lib/components/arc/text-morph';
	import Demo from '../Demo.svelte';

	const STEPS = [
		{ id: 'build', label: 'Build transactions' },
		{ id: 'sign', label: 'Sign in browser' },
		{ id: 'send', label: 'Send order' },
		{ id: 'land', label: 'Confirm on-chain' }
	];

	let confirmations = $state(0);
	let amount = $state(1.5);
	let step = $state(1);
	let failed = $state(false);
	let name = $state('Test Project');
	let status = $state('Not launched');
	const steps = $derived(
		STEPS.map((entry, index) =>
			failed && index === step
				? { ...entry, error: 'The payment provider declined the order' }
				: entry
		)
	);
</script>

<Demo title="Hold to confirm">
	<HoldToConfirm
		label="Hold to delete project"
		confirmedLabel="Deleted"
		tone="danger"
		onConfirm={() => confirmations++}
	>
		{#snippet icon()}<Trash2Icon size={16} />{/snippet}
	</HoldToConfirm>
	<span style:font-size="var(--arc-text-sm)" style:color="var(--arc-text-muted)"
		>Confirmed {confirmations}×</span
	>
</Demo>

<Demo title="Copy button">
	<CopyButton value="7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" label="Copy address" />
	<CopyButton value="abc" iconOnly variant="plain" aria-label="Copy" />
</Demo>

<Demo title="Animated counter and slot text">
	<span class="text-2xl font-semibold">
		<AnimatedCounter value={amount} decimals={4} suffix=" SOL" />
	</span>
	<span class="text-2xl font-semibold"><SlotText value={amount * 1000} /></span>
	<Button size="sm" variant="secondary" onclick={() => (amount += 0.25)}>+0.25</Button>
</Demo>

<Demo title="Stepper" wide>
	<div class="w-full max-w-sm">
		<Stepper {steps} current={step} orientation="vertical" label="Order progress" />
	</div>
	<Button size="sm" variant="secondary" onclick={() => (step = Math.min(step + 1, STEPS.length))}
		>Next</Button
	>
	<Button size="sm" variant="secondary" onclick={() => (failed = !failed)}>Toggle error</Button>
</Demo>

<Demo title="Inline edit and text morph">
	<InlineEdit
		value={name}
		onSave={(next) => {
			name = next;
		}}
		label="Project name"
		variant="title"
	/>
	<TextMorph text={status} />
	<Button
		size="sm"
		variant="secondary"
		onclick={() => (status = status === 'Live' ? 'Not launched' : 'Live')}>Toggle</Button
	>
</Demo>

<Demo title="Progress">
	<div class="w-full max-w-xs"><Progress value={62} label="Curve filled" showValue /></div>
</Demo>
