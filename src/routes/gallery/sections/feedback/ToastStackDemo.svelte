<script lang="ts">
	import { ToastStack, ToastStackProvider } from '$lib/components/arc/toast-stack';
	import Demo from '../../Demo.svelte';
	import ToastStackAsyncControls from './ToastStackAsyncControls.svelte';
	import ToastStackTypesControls from './ToastStackTypesControls.svelte';
</script>

<Demo title="Toast stack · types" wide>
	<div class="stage">
		<ToastStackProvider>
			<ToastStackTypesControls />
			<ToastStack contained label="Type examples" />
		</ToastStackProvider>
	</div>
</Demo>

<Demo title="Toast stack · loading, View and Undo" wide>
	<div class="stage">
		<ToastStackProvider>
			<ToastStackAsyncControls />
			<ToastStack contained position="bottom-center" label="Async examples" />
		</ToastStackProvider>
	</div>
</Demo>

<style>
	.stage {
		position: relative;
		width: 100%;
		height: 320px;
		overflow: clip;
	}
</style>
