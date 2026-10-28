<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';

	type Props = DialogPrimitive.RootProps & { defaultOpen?: boolean };

	let { defaultOpen = false, open = $bindable(defaultOpen), ...rest }: Props = $props();
</script>

<DialogPrimitive.Root bind:open {...rest} />
