<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import { Stepper, type StepperStep } from '$lib/components/arc/stepper';
	import Demo from '../../Demo.svelte';

	const ONBOARDING: StepperStep[] = [
		{ id: 'account', label: 'Account', description: 'Name and email' },
		{ id: 'workspace', label: 'Workspace', description: 'Pick a URL' },
		{ id: 'team', label: 'Team', description: 'Invite teammates' },
		{ id: 'billing', label: 'Billing', description: 'Choose a plan' }
	];

	const RELEASE: StepperStep[] = [
		{ id: 'build', label: 'Build', description: 'Compiled in 41s' },
		{ id: 'test', label: 'Tests', description: '312 passed' },
		{ id: 'migrate', label: 'Migrate database', error: 'Lock timeout on the invoices table' },
		{ id: 'release', label: 'Release', description: 'Roll out to all regions' }
	];
	const FAILED_STEP = 2;

	let onboardingStep = $state(1);
	let setupStep = $state(2);
</script>

<Demo title="Stepper · horizontal" wide>
	<div class="stack">
		<Stepper steps={ONBOARDING} current={onboardingStep} />
		<div class="controls">
			<Button
				variant="ghost"
				size="sm"
				disabled={onboardingStep === 0}
				onclick={() => (onboardingStep -= 1)}
			>
				Back
			</Button>
			<Button
				size="sm"
				disabled={onboardingStep === ONBOARDING.length}
				onclick={() => (onboardingStep += 1)}
			>
				{onboardingStep === ONBOARDING.length - 1 ? 'Finish' : 'Next'}
			</Button>
		</div>
	</div>
</Demo>

<Demo title="Stepper · vertical with an error">
	<div class="narrow">
		<Stepper steps={RELEASE} current={FAILED_STEP} orientation="vertical" label="Release" />
	</div>
</Demo>

<Demo title="Stepper · go back to a finished step">
	<div class="narrow">
		<Stepper
			steps={ONBOARDING}
			current={setupStep}
			orientation="vertical"
			details="current"
			onStepSelect={(index) => (setupStep = index)}
		/>
		<div class="controls">
			<Button size="sm" disabled={setupStep === ONBOARDING.length} onclick={() => (setupStep += 1)}>
				Next
			</Button>
		</div>
	</div>
</Demo>

<Demo title="Stepper · compact">
	<div class="narrow">
		<Stepper steps={ONBOARDING} current={onboardingStep} compact />
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: min(100%, 640px);
		gap: var(--arc-space-6);
	}
	.narrow {
		display: grid;
		width: min(100%, 320px);
		gap: var(--arc-space-4);
	}
	.controls {
		display: flex;
		justify-content: flex-end;
		gap: var(--arc-space-2);
	}
</style>
