import { Dialog } from 'bits-ui';

export { default as Drawer } from './Drawer.svelte';
export { default as DrawerContent } from './DrawerContent.svelte';
export type { DrawerProps } from './Drawer.svelte';
export type { DrawerSide } from './DrawerContent.svelte';

export const DrawerTrigger = Dialog.Trigger;
export const DrawerClose = Dialog.Close;
