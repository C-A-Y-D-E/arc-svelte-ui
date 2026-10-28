<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import { UsageMeter, type UsageMeterSegment } from '$lib/components/arc/usage-meter';
	import Demo from '../../Demo.svelte';

	const STORAGE_LIMIT = 50;
	const BASE_STORAGE: UsageMeterSegment[] = [
		{ id: 'files', label: 'Files', value: 21.4 },
		{ id: 'media', label: 'Media', value: 14.2 },
		{ id: 'backups', label: 'Backups', value: 6.8 }
	];
	const NEAR_STORAGE: UsageMeterSegment[] = [
		{ id: 'files', label: 'Files', value: 23.1 },
		{ id: 'media', label: 'Media', value: 16.5 },
		{ id: 'backups', label: 'Backups', value: 6.2 }
	];
	const OVER_STORAGE: UsageMeterSegment[] = [
		{ id: 'files', label: 'Files', value: 24.8 },
		{ id: 'media', label: 'Media', value: 21.3 },
		{ id: 'backups', label: 'Backups', value: 9.6 }
	];
	const MEDIA_UPLOAD_GB = 3.7;

	let storage = $state(BASE_STORAGE);

	function uploadMedia() {
		storage = storage.map((segment) =>
			segment.id === 'media' ? { ...segment, value: segment.value + MEDIA_UPLOAD_GB } : segment
		);
	}

	const SEAT_LIMITS = [25, 40];
	let seatLimit = $state(SEAT_LIMITS[0]);
	const seats: UsageMeterSegment[] = [
		{ id: 'admins', label: 'Admins', value: 4 },
		{ id: 'members', label: 'Members', value: 17 },
		{ id: 'guests', label: 'Guests', value: 3 },
		{ id: 'bots', label: 'Bots', value: 2 }
	];
</script>

<Demo title="Usage meter · storage" wide>
	<div class="stage">
		<UsageMeter label="Workspace storage" unit="GB" limit={STORAGE_LIMIT} segments={storage} />
		<div class="controls">
			<Button variant="secondary" size="sm" onclick={uploadMedia}
				>Upload {MEDIA_UPLOAD_GB} GB media</Button
			>
			<Button variant="secondary" size="sm" onclick={() => (storage = NEAR_STORAGE)}
				>Almost full</Button
			>
			<Button variant="secondary" size="sm" onclick={() => (storage = OVER_STORAGE)}
				>Over limit</Button
			>
			<Button variant="ghost" size="sm" onclick={() => (storage = BASE_STORAGE)}>Reset</Button>
		</div>
	</div>
</Demo>

<Demo title="Usage meter · seats, limit change" wide>
	<div class="stage">
		<UsageMeter label="Team seats" limit={seatLimit} decimals={0} segments={seats} />
		<div class="controls">
			{#each SEAT_LIMITS as limit (limit)}
				<Button
					variant={seatLimit === limit ? 'primary' : 'secondary'}
					size="sm"
					onclick={() => (seatLimit = limit)}
				>
					{limit} seat plan
				</Button>
			{/each}
		</div>
	</div>
</Demo>

<style>
	.stage {
		display: grid;
		width: min(100%, 560px);
		gap: var(--arc-space-6);
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: var(--arc-space-2);
	}
</style>
