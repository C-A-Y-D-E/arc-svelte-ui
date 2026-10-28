import { Popover as PopoverPrimitive } from 'bits-ui';

export { default as PopoverTrigger } from './PopoverTrigger.svelte';
export { default as PopoverContent } from './PopoverContent.svelte';
export const Popover = PopoverPrimitive.Root;
export const PopoverClose = PopoverPrimitive.Close;
