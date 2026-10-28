import { animate } from 'motion';

/**
 * Stand-in for Motion's shared layoutId morph between the card and its quick look: the fixed panel flies from
 * one box to the other by animating its real top/left/width/height, so its content lays out at every step
 * instead of being scale-corrected. Title size and content padding follow on the same spring.
 */

export type MorphParts = { surface: HTMLElement; content: HTMLElement; title: HTMLElement };

export type Frame = {
	top: number;
	left: number;
	width: number;
	height: number;
	radius: number;
	padding: number;
	fontSize: number;
};

export type Flight = ReturnType<typeof animate>[];

/** While flying, the panel leaves its centered layout and follows the animated box alone. */
const PINNED_STYLE = { inset: 'auto', margin: '0', maxHeight: 'none', overflow: 'hidden' };
const FLIGHT_PROPERTIES = [
	'inset',
	'margin',
	'max-height',
	'overflow',
	'top',
	'left',
	'width',
	'height',
	'border-radius'
];

export function morphParts(surface: HTMLElement): MorphParts | undefined {
	const content = surface.querySelector<HTMLElement>('[data-part="content"]');
	const title = surface.querySelector<HTMLElement>('[data-part="title"]');
	return content && title ? { surface, content, title } : undefined;
}

export function readFrame({ surface, content, title }: MorphParts): Frame {
	const box = surface.getBoundingClientRect();
	return {
		top: box.top,
		left: box.left,
		width: box.width,
		height: box.height,
		radius: parseFloat(getComputedStyle(surface).borderTopLeftRadius),
		padding: parseFloat(getComputedStyle(content).paddingTop),
		fontSize: parseFloat(getComputedStyle(title).fontSize)
	};
}

/** Drops every inline value a flight wrote, so the panel falls back to its own centered layout. */
export function land({ surface, content, title }: MorphParts) {
	for (const property of FLIGHT_PROPERTIES) surface.style.removeProperty(property);
	content.style.removeProperty('padding');
	title.style.removeProperty('font-size');
}

export function fly(parts: MorphParts, from: Frame, to: Frame, transition: object): Flight {
	Object.assign(parts.surface.style, PINNED_STYLE);
	return [
		animate(
			parts.surface,
			{
				top: [from.top, to.top],
				left: [from.left, to.left],
				width: [from.width, to.width],
				height: [from.height, to.height],
				borderRadius: [from.radius, to.radius]
			},
			transition
		),
		animate(parts.content, { padding: [from.padding, to.padding] }, transition),
		animate(parts.title, { fontSize: [from.fontSize, to.fontSize] }, transition)
	];
}
