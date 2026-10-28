<script lang="ts">
	import { Carousel } from '$lib/components/arc/carousel';
	import Demo from '../../Demo.svelte';

	type Product = { name: string; detail: string; price: string; alt: string; photo: string };

	const ROTATION_MS = 5000;

	/** Flat stand-in photography, drawn inline so the demo has no network dependency. */
	function photo(background: string, scene: string) {
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" fill="${background}"/>${scene}</svg>`;
		return `data:image/svg+xml,${encodeURIComponent(svg)}`;
	}

	const products: Product[] = [
		{
			name: 'Oak lounge chair',
			detail: 'Woven seat on a solid oak frame',
			price: '$1,450',
			alt: 'A woven oak lounge chair with a linen cushion on a concrete floor',
			photo: photo(
				'#d8d1c6',
				'<rect y="170" width="240" height="70" fill="#bdb5a9"/><rect x="70" y="92" width="100" height="70" rx="10" fill="#9a7a58"/><rect x="62" y="140" width="116" height="24" rx="8" fill="#efe8dc"/><rect x="72" y="160" width="8" height="42" fill="#7b5d40"/><rect x="160" y="160" width="8" height="42" fill="#7b5d40"/>'
			)
		},
		{
			name: 'Opal table lamp',
			detail: 'Hand-blown glass shade',
			price: '$320',
			alt: 'A white mushroom table lamp glowing beside books',
			photo: photo(
				'#cfc9bf',
				'<rect y="172" width="240" height="68" fill="#a8998a"/><path d="M78 118a42 38 0 0 1 84 0z" fill="#f7f3ea"/><rect x="114" y="118" width="12" height="54" fill="#efe9de"/><rect x="40" y="150" width="30" height="22" fill="#6f7f76"/><rect x="44" y="136" width="24" height="14" fill="#b98f6a"/>'
			)
		},
		{
			name: 'Stonewashed linen throw',
			detail: 'Fringed edges, natural flax',
			price: '$180',
			alt: 'Folded natural linen throws in soft window light',
			photo: photo(
				'#e3ddd2',
				'<rect x="50" y="150" width="140" height="26" rx="6" fill="#c7b9a4"/><rect x="56" y="124" width="128" height="26" rx="6" fill="#d9ccb8"/><rect x="62" y="98" width="116" height="26" rx="6" fill="#b5a58e"/><rect y="176" width="240" height="64" fill="#cbc3b6"/>'
			)
		},
		{
			name: 'Ribbed glass carafe',
			detail: 'Holds one litre',
			price: '$64',
			alt: 'A ribbed glass carafe beside two tumblers',
			photo: photo(
				'#d5dcd8',
				'<rect y="168" width="240" height="72" fill="#b4bdb8"/><path d="M104 70h32v24l14 20v54h-60v-54l14-20z" fill="#eef3f1" opacity=".85"/><rect x="160" y="136" width="26" height="32" fill="#eef3f1" opacity=".8"/><rect x="54" y="140" width="26" height="28" fill="#eef3f1" opacity=".8"/>'
			)
		},
		{
			name: 'Sea at dusk',
			detail: 'Archival print, 50 × 70 cm',
			price: '$240',
			alt: 'A calm sea at dusk with a low island on the horizon',
			photo: photo(
				'#c9a99c',
				'<rect y="132" width="240" height="108" fill="#5f7280"/><path d="M130 132q30-18 70 0z" fill="#3f4a53"/><circle cx="70" cy="104" r="12" fill="#ead2bf"/>'
			)
		}
	];

	const shades = ['#d8d1c6', '#cfc9bf', '#e3ddd2', '#d5dcd8', '#c9a99c', '#bfc6cf'];
	let controlledIndex = $state(2);
</script>

<Demo title="Carousel · products with rotation" wide>
	<div class="stage">
		<Carousel
			label="From the Harbour suites"
			items={products}
			slideSize="min(74cqw, 256px)"
			defaultIndex={1}
			interval={ROTATION_MS}
			slideLabel={(slideIndex, count) =>
				`${products[slideIndex].name}, ${slideIndex + 1} of ${count}`}
		>
			{#snippet slide(product)}
				<article class="card">
					<div class="photo">
						<img src={product.photo} alt={product.alt} draggable="false" />
					</div>
					<div class="caption">
						<h4 class="name">{product.name}</h4>
						<p class="detail">{product.detail}</p>
						<span class="price">{product.price}</span>
					</div>
				</article>
			{/snippet}
		</Carousel>
	</div>
</Demo>

<Demo title="Carousel · controlled index" wide>
	<div class="stage">
		<Carousel
			label="Colour swatches"
			items={shades}
			bind:index={controlledIndex}
			slideSize="min(60cqw, 200px)"
		>
			{#snippet slide(shade, slideIndex)}
				<div class="swatch" style:background={shade}>{slideIndex + 1}</div>
			{/snippet}
		</Carousel>
		<p class="readout">Active slide: {controlledIndex + 1}</p>
	</div>
</Demo>

<style>
	.stage {
		display: grid;
		width: 100%;
		max-width: 44rem;
		gap: var(--arc-space-3);
	}
	.card {
		display: grid;
		gap: var(--arc-space-3);
		margin: 0;
	}
	.photo {
		position: relative;
		aspect-ratio: 1;
		overflow: hidden;
		border-radius: var(--arc-radius-panel);
		background: var(--arc-surface-muted);
	}
	.photo img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.photo::after {
		position: absolute;
		inset: 0;
		border: 1px solid var(--arc-border-subtle);
		border-radius: inherit;
		content: '';
		pointer-events: none;
	}
	.caption {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		column-gap: var(--arc-space-3);
		row-gap: 1px;
		align-items: baseline;
		padding-inline: var(--arc-space-1);
	}
	.name,
	.detail {
		margin: 0;
		overflow: hidden;
		letter-spacing: var(--arc-tracking-body);
		line-height: var(--arc-leading-body);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.name {
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		font-weight: 500;
	}
	.detail {
		grid-row: 2;
		grid-column: 1 / -1;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
	.price {
		grid-row: 1;
		grid-column: 2;
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		font-variant-numeric: tabular-nums;
		letter-spacing: var(--arc-tracking-body);
		line-height: var(--arc-leading-body);
	}
	.swatch {
		display: grid;
		aspect-ratio: 4 / 3;
		place-items: center;
		border-radius: var(--arc-radius-panel);
		color: oklch(25% 0 0);
		font-size: var(--arc-text-2xl);
		font-weight: 600;
	}
	.readout {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		text-align: center;
	}
</style>
