<script lang="ts">
	import { ExpandingSearch, type ExpandingSearchItem } from '$lib/components/arc/expanding-search';
	import { InlineEdit } from '$lib/components/arc/inline-edit';
	import { Input } from '$lib/components/arc/input';
	import { NumberField } from '$lib/components/arc/number-field';
	import { PasswordField } from '$lib/components/arc/password-field';
	import { PasswordStrength } from '$lib/components/arc/password-strength';
	import { SearchField } from '$lib/components/arc/search-field';
	import { Textarea } from '$lib/components/arc/textarea';
	import Demo from '../Demo.svelte';

	const BIO_LIMIT = 160;
	const SAVE_DELAY_MS = 900;

	let email = $state('');
	let bio = $state('');
	let password = $state('');
	let newPassword = $state('');
	let query = $state('');
	let projectName = $state('Arc website');
	let description = $state('A motion-first component library for product teams.');
	let lastPicked = $state('');
	let seats = $state(5);
	let creatorFee = $state<number | null>(null);

	const emailError = $derived(email && !email.includes('@') ? 'Enter a valid email' : undefined);
	const bioLeft = $derived(BIO_LIMIT - bio.length);

	const searchItems: ExpandingSearchItem[] = [
		{ id: 'p1', title: 'Arc website', group: 'Projects', meta: 'Updated today' },
		{ id: 'p2', title: 'Spring launch', group: 'Projects', meta: 'Updated yesterday' },
		{ id: 'p3', title: 'Design system audit', group: 'Projects', meta: 'Owned by Mira' },
		{ id: 'd1', title: 'Motion tokens', group: 'Docs', keywords: ['spring', 'easing'] },
		{ id: 'd2', title: 'Form field guidelines', group: 'Docs', meta: 'Inputs and validation' },
		{ id: 'd3', title: 'Release notes', group: 'Docs', meta: 'v2.4' }
	];
	const recent = searchItems.slice(0, 2);

	function wait() {
		return new Promise((resolve) => setTimeout(resolve, SAVE_DELAY_MS));
	}

	async function saveName(next: string) {
		await wait();
		if (next.toLowerCase().includes('fail')) throw new Error('Rejected');
		projectName = next;
	}
</script>

<Demo title="Input · helper and error">
	<div class="stack">
		<Input
			label="Email"
			type="email"
			placeholder="you@example.com"
			bind:value={email}
			description="We only use this for receipts."
			error={emailError}
			data-testid="email-input"
		/>
		<Input label="Workspace" placeholder="Disabled" disabled />
	</div>
</Demo>

<Demo title="Number field · steppers, limits, units">
	<div class="stack">
		<NumberField
			label="Seats"
			bind:value={seats}
			min={1}
			max={10}
			scrub
			suffix={(count) => (count === 1 ? ' seat' : ' seats')}
			description="Hold a stepper to repeat, arrow keys step, drag the label to scrub."
		/>
		<NumberField
			label="Creator fee"
			size="sm"
			bind:value={creatorFee}
			min={0.01}
			max={3}
			step={0.01}
			suffix="%"
			placeholder="0.01 to 3"
			allowEmpty
			formatOptions={{ minimumFractionDigits: 0, maximumFractionDigits: 2 }}
		/>
		<NumberField label="Locked" value={2} min={0} max={5} disabled />
	</div>
</Demo>

<Demo title="Textarea · live count">
	<div class="stack">
		<Textarea
			label="Bio"
			placeholder="A few words about you"
			bind:value={bio}
			description={`${bioLeft} characters left`}
			error={bioLeft < 0 ? 'Keep it under 160 characters' : undefined}
			data-testid="bio-textarea"
		/>
	</div>
</Demo>

<Demo title="Password field · reveal">
	<div class="stack">
		<PasswordField
			label="Password"
			bind:value={password}
			description="Use the password you signed up with."
			data-testid="password-field"
		/>
	</div>
</Demo>

<Demo title="Password strength · rules and meter">
	<div class="stack">
		<PasswordStrength
			label="New password"
			bind:value={newPassword}
			data-testid="password-strength"
		/>
	</div>
</Demo>

<Demo title="Search field · clear">
	<div class="stack">
		<SearchField
			label="Search"
			placeholder="Search files"
			bind:value={query}
			data-testid="search-field"
		/>
	</div>
</Demo>

<Demo title="Expanding search · header" wide>
	<div class="toolbar">
		<span class="toolbar-title">Workspace{lastPicked ? ` · ${lastPicked}` : ''}</span>
		<div class="lane">
			<ExpandingSearch
				label="Search projects and docs"
				items={searchItems}
				suggestions={recent}
				onSelect={(item) => (lastPicked = item.title)}
			/>
		</div>
	</div>
</Demo>

<Demo title="Inline edit · title (type “fail” to see a rollback)">
	<div class="stack">
		<InlineEdit
			as="h2"
			label="Project name"
			value={projectName}
			validate={(next) => (next.trim() ? null : 'Name can’t be empty')}
			onSave={saveName}
		/>
	</div>
</Demo>

<Demo title="Inline edit · multiline body">
	<div class="stack">
		<InlineEdit
			label="Description"
			variant="body"
			multiline
			value={description}
			placeholder="Add a description"
			onSave={async (next) => {
				await wait();
				description = next;
			}}
		/>
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: 100%;
		max-width: 22rem;
		gap: var(--arc-space-5);
	}
	.toolbar {
		display: flex;
		width: 100%;
		min-height: 22rem;
		align-items: flex-start;
		gap: var(--arc-space-4);
	}
	.toolbar-title {
		flex: none;
		padding-top: var(--arc-space-3);
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
	}
	.lane {
		flex: 1;
		min-width: 0;
	}
</style>
