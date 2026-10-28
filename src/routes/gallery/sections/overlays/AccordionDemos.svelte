<script lang="ts">
	import { Accordion, type AccordionItem } from '$lib/components/arc/accordion';
	import Demo from '../../Demo.svelte';

	const BILLING_FAQ: AccordionItem[] = [
		{
			title: 'Can I cancel anytime?',
			content: 'Yes. Your plan stays active until the period ends.'
		},
		{ title: 'Do you offer refunds?', content: 'Within 14 days of purchase, no questions asked.' },
		{
			title: 'Can I switch plans later?',
			content:
				'Upgrades apply right away and are prorated. Downgrades take effect at the next renewal.'
		}
	];

	const PAGE_FAQ: AccordionItem[] = [
		{
			title: 'What happens to my data if I leave?',
			content:
				'You can export every project as JSON or CSV at any time. We delete workspace data 30 days after cancellation.'
		},
		{
			title: 'Is there a limit on team members?',
			content:
				'Pro workspaces include ten seats. Add more from billing settings; each extra seat is billed monthly.'
		}
	];
</script>

<Demo title="Accordion · FAQ">
	<Accordion items={BILLING_FAQ} />
</Demo>

<Demo title="Accordion · page-level, all closed">
	<Accordion items={PAGE_FAQ} size="lg" defaultOpen={-1} />
</Demo>
