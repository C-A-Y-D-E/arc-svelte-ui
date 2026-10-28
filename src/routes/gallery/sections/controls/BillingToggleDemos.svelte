<script lang="ts">
	import {
		BillingPrice,
		BillingToggle,
		type BillingToggleOption
	} from '$lib/components/arc/billing-toggle';
	import Demo from '../../Demo.svelte';

	const MONTHLY_PRICE = 15;
	const YEARLY_MONTHLY_PRICE = 12;
	const TERMS: BillingToggleOption[] = [
		{ value: 'monthly', label: 'Monthly' },
		{ value: 'quarterly', label: 'Quarterly', badge: '−5%', activeBadge: 'You save 5%' },
		{ value: 'yearly', label: 'Yearly', badge: '−20%', activeBadge: 'You save 20%' }
	];
	const TERM_PRICES: Record<string, number> = { monthly: 40, quarterly: 38, yearly: 32 };

	let period = $state('monthly');
	let term = $state('monthly');

	const yearly = $derived(period === 'yearly');
</script>

<Demo title="Billing toggle · plan price">
	<div class="plan">
		<BillingToggle bind:value={period} />
		<BillingPrice
			amount={yearly ? YEARLY_MONTHLY_PRICE : MONTHLY_PRICE}
			was={yearly ? MONTHLY_PRICE : undefined}
			period={yearly ? 'per month, billed yearly' : 'per month'}
		/>
		<p class="output">Billing: {period}</p>
	</div>
</Demo>

<Demo title="Billing toggle · large, three terms" wide>
	<div class="plan">
		<BillingToggle size="lg" label="Contract term" options={TERMS} bind:value={term} />
		<BillingPrice amount={TERM_PRICES[term]} />
		<p class="output">Term: {term}</p>
	</div>
</Demo>

<style>
	.plan {
		display: grid;
		justify-items: center;
		gap: var(--arc-space-4);
	}
	.output {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
</style>
