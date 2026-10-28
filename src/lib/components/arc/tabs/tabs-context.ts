import { getContext, setContext } from 'svelte';

/**
 * `direction` is +1 when the new tab sits after the old one; `panelHeight` holds the visible panel height so the
 * next panel can morph from it; `leavingRect` pins the outgoing panel where it was on screen.
 */
export type TabsContext = {
	readonly active: string;
	readonly direction: number;
	readonly root: HTMLElement | null;
	panelHeight: number | null;
	leavingRect: DOMRect | null;
};

const TABS_KEY = Symbol('arc-tabs');

export function setTabsContext(context: TabsContext) {
	setContext(TABS_KEY, context);
}

export function getTabsContext() {
	return getContext<TabsContext>(TABS_KEY);
}
