import { getContext, setContext } from 'svelte';

/** Mirrors the open state so the panel can stay mounted while it slides out, retarget mid-flight, and close itself after a drag. */
export type DrawerState = {
	readonly open: boolean;
	readonly flung: boolean;
	setOpen: (open: boolean) => void;
	fling: () => void;
};

const DRAWER_CONTEXT = Symbol('arc-drawer');

export function setDrawerContext(state: DrawerState) {
	setContext(DRAWER_CONTEXT, state);
}

export function getDrawerContext(): DrawerState | undefined {
	return getContext(DRAWER_CONTEXT);
}
