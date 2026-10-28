import { animate, motionValue } from 'motion';
import type { AnimationPlaybackControls, MotionValue, Transition } from 'motion';
import { createContext, untrack } from 'svelte';
import { isReducedMotion, motionTokens } from '../motion';

/** Configuration one `ResizablePanel` hands to its group. */
export type PanelConfig = {
	readonly id: string;
	readonly label: string;
	readonly defaultSize: number;
	readonly minSize?: number;
	readonly maxSize?: number;
	readonly collapsible?: boolean;
	readonly defaultCollapsed?: boolean;
};

/** Which neighbour of a divider is hidden, if any. */
export type CollapseMode = 'open' | 'before' | 'after';

type PairLimits = { pair: number; lo: number; hi: number };
type Sample = [time: number, x: number];
type Drag = PairLimits & {
	handle: number;
	pointer: number;
	startX: number;
	startBefore: number;
	startAfter: number;
	mode: CollapseMode;
	startMode: CollapseMode;
	moved: boolean;
	catching: boolean;
	samples: Sample[];
};

type HandleEvent<E extends Event> = E & { currentTarget: HTMLElement };

export const DEFAULT_MIN = 80;
/** How far in px a pane can be pulled past a limit before it stops giving. */
const STRETCH = 44;
const RUBBER_STIFFNESS = 0.55;
/** Keyboard steps in px; Shift takes the larger one. */
const STEP = 16;
const BIG_STEP = 64;
const COLLAPSE_RATIO = 0.5;
const MIN_COLLAPSE_DISTANCE = 40;
const MOMENTUM_RATE = 0.99;
const MS_PER_SECOND = 1000;
const VELOCITY_WINDOW_MS = 90;
const VELOCITY_STALE_MS = 50;
const MAX_SAMPLES = 16;
const DRAG_THRESHOLD = 2;
const SUBPIXEL = 0.5;
const CATCH_UP_DISTANCE = 0.75;
const SETTLED_DISTANCE = 0.01;
const RESIZE_KEYS = ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** Past a limit every pixel costs more, like pulling against elastic. */
const rubber = (overshoot: number) =>
	(overshoot * STRETCH * RUBBER_STIFFNESS) / (STRETCH + RUBBER_STIFFNESS * overshoot);
const band = (value: number, lo: number, hi: number) =>
	value < lo ? lo - rubber(lo - value) : value > hi ? hi + rubber(value - hi) : value;
/** A collapsible pane snaps closed once the pointer is this far below its minimum. */
const collapseAt = (min: number) => min - Math.max(min * COLLAPSE_RATIO, MIN_COLLAPSE_DISTANCE);
/** Short momentum projection, used only to decide whether a flick collapses or restores a pane. */
const project = (velocity: number) =>
	((velocity / MS_PER_SECOND) * MOMENTUM_RATE) / (1 - MOMENTUM_RATE);
const toShares = (values: number[]) => {
	const total = values.reduce((sum, value) => sum + value, 0) || 1;
	return values.map((value) => (value / total) * 100);
};
const startsCollapsed = (config: PanelConfig) =>
	Boolean(config.collapsible && config.defaultCollapsed);
const initialSize = (config: PanelConfig) => (startsCollapsed(config) ? 0 : config.defaultSize);

function velocityOf(samples: Sample[], now: number) {
	const recent = samples.filter(([time]) => now - time <= VELOCITY_WINDOW_MS);
	if (recent.length < 2 || now - recent[recent.length - 1][0] > VELOCITY_STALE_MS) return 0;
	const [firstTime, firstX] = recent[0];
	const [lastTime, lastX] = recent[recent.length - 1];
	return lastTime > firstTime ? (lastX - firstX) / ((lastTime - firstTime) / MS_PER_SECOND) : 0;
}

/**
 * The state and gestures behind a `ResizablePanels` group. Panes register in order as they mount;
 * dividers and panes read from here and write their widths straight to the DOM, so a drag never re-renders content.
 */
export class PanelGroup {
	configs = $state.raw<PanelConfig[]>([]);
	collapsed = $state.raw<boolean[]>([]);
	free = $state.raw<boolean[]>([]);
	shares = $state.raw<number[]>([]);
	resizing = $state<number | null>(null);
	available = $state(0);
	// A group narrower than every minimum together scales the minimums down in proportion, the same floor the CSS applies,
	// so the panes fill the group instead of overflowing it and a press never re-lays them out.
	minTotal = $derived(
		this.configs.reduce((sum, config) => sum + (config.minSize ?? DEFAULT_MIN), 0)
	);

	// Sizes are flex-grow factors: the default shares before the first interaction, then px. Flex keeps them proportional as the group resizes.
	readonly sizes: MotionValue<number>[] = [];
	readonly panelNodes: (HTMLElement | null)[] = [];
	#restoreSizes: (number | null)[] = [];
	#running: AnimationPlaybackControls[] = [];
	#token = 0;
	#goals: number[] | null = null;
	#stale = true;
	#drag: Drag | null = null;
	#layoutChanged: () => ((sizes: number[]) => void) | undefined;

	constructor(layoutChanged: () => ((sizes: number[]) => void) | undefined) {
		this.#layoutChanged = layoutChanged;
	}

	get count() {
		return this.configs.length;
	}

	/** Adds a pane in mount order and returns its index. A pane that remounts with the same id keeps its slot. */
	register(config: PanelConfig) {
		return untrack(() => {
			const existing = this.configs.findIndex((current) => current.id === config.id);
			if (existing >= 0) {
				this.configs = this.configs.map((current, index) =>
					index === existing ? config : current
				);
				return existing;
			}
			this.sizes.push(motionValue(initialSize(config)));
			this.panelNodes.push(null);
			this.#restoreSizes.push(null);
			this.configs = [...this.configs, config];
			this.collapsed = [...this.collapsed, startsCollapsed(config)];
			this.free = [...this.free, false];
			this.shares = toShares(this.configs.map(initialSize));
			return this.configs.length - 1;
		});
	}

	minOf(index: number) {
		const min = this.configs[index]?.minSize ?? DEFAULT_MIN;
		const tooNarrow = this.available > 0 && this.available < this.minTotal;
		return tooNarrow ? (min * this.available) / this.minTotal : min;
	}

	maxOf(index: number) {
		return this.configs[index]?.maxSize ?? Infinity;
	}

	modeOf(handle: number): CollapseMode {
		return this.collapsed[handle] ? 'before' : this.collapsed[handle + 1] ? 'after' : 'open';
	}

	/** Called when the group resizes: the px sizes are out of step with the screen until the next interaction re-measures. */
	measure() {
		this.#stale = true;
		this.available = this.panelNodes.reduce(
			(sum, node) => sum + (node?.getBoundingClientRect().width ?? 0),
			0
		);
	}

	limits(handle: number, before: number, after: number): PairLimits {
		const pair = before + after;
		let lo = Math.max(this.minOf(handle), pair - this.maxOf(handle + 1));
		let hi = Math.min(this.maxOf(handle), pair - this.minOf(handle + 1));
		// A group too narrow for every minimum may already hold a pane below it; never yank it to the limit on grab.
		if (before > 0 && after > 0) {
			lo = Math.min(lo, before);
			hi = Math.max(hi, before);
		}
		if (lo > hi) lo = hi = clamp((lo + hi) / 2, 0, pair);
		return { pair, lo: clamp(lo, 0, pair), hi: clamp(hi, 0, pair) };
	}

	pointerDown(handle: number, event: HandleEvent<PointerEvent>) {
		if (this.#drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
		const values = this.#begin([handle, handle + 1]);
		const limits = this.limits(handle, values[handle], values[handle + 1]);
		event.currentTarget.setPointerCapture(event.pointerId);
		const mode = this.modeOf(handle);
		this.#drag = {
			...limits,
			handle,
			pointer: event.pointerId,
			startX: event.clientX,
			startBefore: values[handle],
			startAfter: values[handle + 1],
			mode,
			startMode: mode,
			moved: false,
			catching: false,
			samples: [[event.timeStamp, event.clientX]]
		};
	}

	pointerMove(event: PointerEvent) {
		const drag = this.#drag;
		if (!drag || drag.pointer !== event.pointerId) return;
		const dx = event.clientX - drag.startX;
		if (!drag.moved) {
			if (Math.abs(dx) < DRAG_THRESHOLD) return;
			drag.moved = true;
			this.resizing = drag.handle;
		}
		const next = this.#resolve(drag.handle, drag.startBefore + dx, drag);
		if (next.mode !== drag.mode) {
			drag.mode = next.mode;
			drag.catching = true;
		}
		this.#moveBoundary(drag, next.size);
		drag.samples.push([event.timeStamp, event.clientX]);
		if (drag.samples.length > MAX_SAMPLES) drag.samples.shift();
	}

	pointerEnd(event: PointerEvent, cancelled: boolean) {
		const drag = this.#drag;
		if (!drag || drag.pointer !== event.pointerId) return;
		this.#drag = null;
		this.resizing = null;
		const { handle, pair, lo, hi } = drag;
		if (!drag.moved) {
			// A press on a divider that hides a pane brings it back.
			if (drag.startMode !== 'open' && !cancelled) this.#restore(handle, drag.startMode);
			else this.#commit();
			return;
		}
		const raw = drag.startBefore + event.clientX - drag.startX;
		const velocity = cancelled ? 0 : velocityOf(drag.samples, event.timeStamp);
		const flung = this.#resolve(handle, raw + project(velocity), drag);
		// A flick toward an edge collapses; a flick back out restores. Otherwise the divider stays where it was let go, inside its limits.
		const mode = cancelled ? drag.startMode : flung.mode;
		const size =
			mode === 'before'
				? 0
				: mode === 'after'
					? pair
					: cancelled
						? drag.startBefore
						: clamp(raw, lo, hi);
		this.#remember(handle, drag.startBefore, drag.startAfter, mode);
		this.#setCollapsedPair(handle, mode);
		this.#glide(this.#pairTargets(handle, size, pair));
	}

	keyDown(handle: number, event: KeyboardEvent) {
		const drag = this.#drag;
		if (event.key === 'Escape' && drag) {
			event.preventDefault();
			this.#cancelDrag(drag);
			return;
		}
		if (drag || !RESIZE_KEYS.includes(event.key)) return;
		event.preventDefault();
		if (event.key === 'Enter') this.#toggle(handle);
		else this.#step(handle, event);
	}

	/** Resets to the default shares, fitted to the current width so every pane respects its limits. */
	reset() {
		const values = this.#begin(this.configs.map((_, index) => index));
		const total = values.reduce((sum, value) => sum + value, 0);
		const wanted = this.configs.map(initialSize);
		const targets = [...wanted];
		const frozen = wanted.map((value) => value === 0);
		for (let pass = 0; pass < this.count; pass++) {
			const fixed = targets.reduce((sum, value, index) => (frozen[index] ? sum + value : sum), 0);
			const share = wanted.reduce((sum, value, index) => (frozen[index] ? sum : sum + value), 0);
			let violated = false;
			targets.forEach((_, index) => {
				if (frozen[index]) return;
				const size = share ? (wanted[index] / share) * (total - fixed) : 0;
				const bounded = clamp(size, this.minOf(index), this.maxOf(index));
				targets[index] = bounded;
				if (bounded !== size) {
					frozen[index] = true;
					violated = true;
				}
			});
			if (!violated) break;
		}
		this.collapsed = this.configs.map(startsCollapsed);
		this.#glide(targets);
	}

	/** Starts an interaction: stops anything in flight and makes sure the sizes are the px widths on screen, so nothing moves. */
	#begin(involved: number[]) {
		this.#token += 1;
		this.#stopRunning();
		// Only a group resize (or the first interaction) can put the sizes out of step with the screen; otherwise they are the truth,
		// even before a jump has painted.
		if (this.#stale) {
			this.#stale = false;
			const widths = this.sizes.map(
				(_, index) => this.panelNodes[index]?.getBoundingClientRect().width ?? 0
			);
			const outOfStep = widths.some(
				(width, index) => Math.abs(width - this.sizes[index].get()) > SUBPIXEL
			);
			if (outOfStep) widths.forEach((width, index) => this.sizes[index].jump(width));
		}
		// Freed panes drop their CSS limits while JS owns them, so rubber-banding and collapsing can go past them.
		if (involved.some((index) => !this.free[index])) {
			this.free = this.free.map((value, index) => value || involved.includes(index));
		}
		return this.#currentSizes();
	}

	#commit() {
		const shares = toShares(this.#currentSizes());
		this.free = this.configs.map(() => false);
		this.shares = shares;
		this.#layoutChanged()?.(shares);
	}

	/** Springs panes to new widths from wherever they are, keeping their velocity, then hands the limits back to CSS. */
	#glide(targets: (number | null)[], transition: Transition = motionTokens.spring.smooth) {
		const token = this.#token;
		const finals = targets.map((target, index) => target ?? this.sizes[index].get());
		this.#goals = finals;
		// Assistive technology hears the destination right away rather than after the spring's tail settles.
		this.shares = toShares(finals);
		const moving = targets.flatMap((target, index) =>
			target === null || Math.abs(target - this.sizes[index].get()) < SETTLED_DISTANCE
				? []
				: [[index, target] as const]
		);
		let pending = moving.length;
		const done = () => {
			if (this.#token === token) this.#commit();
		};
		if (isReducedMotion() || !pending) {
			moving.forEach(([index, target]) => this.sizes[index].jump(target));
			done();
			return;
		}
		this.#running = moving.map(([index, target]) =>
			animate(this.sizes[index], target, {
				...transition,
				onComplete: () => {
					pending -= 1;
					if (!pending) done();
				}
			})
		);
	}

	#resolve(
		handle: number,
		raw: number,
		{ pair, lo, hi }: PairLimits
	): { mode: CollapseMode; size: number } {
		if (this.configs[handle].collapsible && raw < collapseAt(this.minOf(handle))) {
			return { mode: 'before', size: 0 };
		}
		if (this.configs[handle + 1].collapsible && pair - raw < collapseAt(this.minOf(handle + 1))) {
			return { mode: 'after', size: pair };
		}
		return { mode: 'open', size: band(raw, lo, hi) };
	}

	/** Sets a pane pair to a new boundary. Any change of collapse state springs; everything else moves with the pointer. */
	#moveBoundary(drag: Drag, size: number) {
		const before = this.sizes[drag.handle];
		const after = this.sizes[drag.handle + 1];
		if (drag.catching && !isReducedMotion()) {
			if (Math.abs(before.get() - size) < CATCH_UP_DISTANCE) {
				drag.catching = false;
				this.#stopRunning();
			} else {
				this.#running = [
					animate(before, size, motionTokens.spring.smooth),
					animate(after, drag.pair - size, motionTokens.spring.smooth)
				];
				return;
			}
		}
		before.set(size);
		after.set(drag.pair - size);
	}

	/** Escape during a drag puts the divider back where it started. */
	#cancelDrag(drag: Drag) {
		this.#drag = null;
		this.resizing = null;
		this.#setCollapsedPair(drag.handle, drag.startMode);
		this.#glide(
			this.sizes.map((_, index) =>
				index === drag.handle
					? drag.startBefore
					: index === drag.handle + 1
						? drag.startAfter
						: null
			)
		);
	}

	#toggle(handle: number) {
		const mode = this.modeOf(handle);
		if (mode !== 'open') this.#restore(handle, mode);
		else if (this.configs[handle].collapsible) this.#collapse(handle, 'before');
		else if (this.configs[handle + 1].collapsible) this.#collapse(handle, 'after');
	}

	#step(handle: number, event: KeyboardEvent) {
		const mode = this.modeOf(handle);
		// Repeated presses build on where the divider is heading, not on where the spring happens to be this frame.
		const springing = this.sizes[handle].isAnimating() || this.sizes[handle + 1].isAnimating();
		const heading = this.#goals && springing ? this.#goals : null;
		const values = this.#begin([handle, handle + 1]);
		const pair = values[handle] + values[handle + 1];
		const before = heading ? clamp(heading[handle], 0, pair) : values[handle];
		const { lo, hi } = this.limits(handle, before, pair - before);
		const left = event.key === 'ArrowLeft';
		const right = event.key === 'ArrowRight';
		// Arrows walk out of a collapsed pane at its minimum, and past a limit into collapse when the pane allows it.
		if (left && mode === 'after') return this.#restoreTo(handle, hi, pair);
		if (right && mode === 'before') return this.#restoreTo(handle, lo, pair);
		if (mode !== 'open') return;
		if (left && before <= lo + SUBPIXEL && this.configs[handle].collapsible)
			return this.#collapse(handle, 'before');
		if (right && before >= hi - SUBPIXEL && this.configs[handle + 1].collapsible) {
			return this.#collapse(handle, 'after');
		}
		const step = event.shiftKey ? BIG_STEP : STEP;
		const size =
			event.key === 'Home'
				? lo
				: event.key === 'End'
					? hi
					: clamp(before + (left ? -step : step), lo, hi);
		const transition = left || right ? motionTokens.spring.snappy : motionTokens.spring.smooth;
		this.#glide(this.#pairTargets(handle, size, pair), transition);
	}

	#restore(handle: number, side: CollapseMode) {
		const values = this.#begin([handle, handle + 1]);
		const { pair, lo, hi } = this.limits(handle, values[handle], values[handle + 1]);
		const size =
			side === 'before'
				? clamp(this.#restoreSizes[handle] ?? this.minOf(handle), lo, hi)
				: clamp(pair - (this.#restoreSizes[handle + 1] ?? this.minOf(handle + 1)), lo, hi);
		this.#restoreTo(handle, size, pair);
	}

	#restoreTo(handle: number, size: number, pair: number) {
		this.#setCollapsedPair(handle, 'open');
		this.#glide(this.#pairTargets(handle, size, pair));
	}

	#collapse(handle: number, side: CollapseMode) {
		const values = this.#begin([handle, handle + 1]);
		const pair = values[handle] + values[handle + 1];
		this.#remember(handle, values[handle], values[handle + 1], side);
		this.#setCollapsedPair(handle, side);
		this.#glide(this.#pairTargets(handle, side === 'before' ? 0 : pair, pair));
	}

	#remember(handle: number, before: number, after: number, mode: CollapseMode) {
		if (mode === 'before' && before > 0) this.#restoreSizes[handle] = before;
		if (mode === 'after' && after > 0) this.#restoreSizes[handle + 1] = after;
	}

	#setCollapsedPair(handle: number, mode: CollapseMode) {
		this.collapsed = this.collapsed.map((value, index) =>
			index === handle ? mode === 'before' : index === handle + 1 ? mode === 'after' : value
		);
	}

	#pairTargets(handle: number, size: number, pair: number) {
		return this.sizes.map((_, index) =>
			index === handle ? size : index === handle + 1 ? pair - size : null
		);
	}

	#currentSizes() {
		return this.sizes.map((size) => size.get());
	}

	#stopRunning() {
		this.#running.forEach((controls) => controls.stop());
		this.#running = [];
	}
}

export const [getPanelGroup, setPanelGroup, hasPanelGroup] = createContext<PanelGroup>();
