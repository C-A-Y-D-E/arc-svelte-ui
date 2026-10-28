# Arc for Svelte

The free components of [Arc](https://uiarc.dev), ported to Svelte 5. Unofficial: Arc is made by
Elia Kuratli and ships for React; this is a community port of its MIT-licensed components. Arc
Pro components are not included and never will be.

- 85 components: buttons, fields, pickers, menus, overlays, feedback, data views and charts, each
  with a demo in the gallery.
- Svelte 5 runes, TypeScript, no Tailwind needed: each component styles itself with scoped CSS
  on a shared set of `--arc-*` tokens.
- Installs like shadcn-svelte: the source is copied into your project, so you own and edit it.
- Built on [bits-ui](https://bits-ui.com) for accessible primitives, [motion](https://motion.dev)
  for animation and [Lucide](https://lucide.dev) icons.

## Install

In a SvelteKit project with [shadcn-svelte](https://shadcn-svelte.com) set up, from the site you
host this registry on (`pnpm build` writes it to `static/r/`):

```sh
# Once: the foundation, theme, motion helpers and texts every component shares.
npx shadcn-svelte@latest add https://<your-host>/r/core.json

# Then any component (it pulls in the components it uses).
npx shadcn-svelte@latest add https://<your-host>/r/button.json
```

Files land in `src/lib/components/arc/`. Import the CSS once in your root stylesheet:

```css
@import '$lib/components/arc/theme.css';
@import '$lib/components/arc/foundation.css';
```

```svelte
<script lang="ts">
	import { Button } from '$lib/components/arc/button';
</script>

<Button onclick={() => console.log('saved')}>Save</Button>
```

## Theming

`foundation.css` maps Arc's tokens onto shadcn-style colour variables (`--background`,
`--foreground`, `--primary`, `--muted-foreground`, `--border`…). `theme.css` ships a neutral light
and dark theme; already using a shadcn theme? Keep it and add the four variables it may lack:
`--highlight`, `--buy`, `--sell` and `--warning`. Dark mode follows a `dark` class on any
ancestor.

## Texts and languages

Every word a component shows or announces lives in `strings.ts`, in English. Edit it, or replace
its functions with your i18n library's.

## Develop

```sh
pnpm install
pnpm dev        # the gallery at http://localhost:5173
pnpm registry   # rebuild static/r/*.json and registry.json
pnpm check      # types and Svelte diagnostics
pnpm build      # registry, then the site
```

A component is a folder in `src/lib/components/arc/` with an `index.ts`. The registry script
finds it, lists the npm packages and other components it imports, and writes its install file.
The gallery's demos live in `src/routes/gallery/sections/`.

The site uses `@sveltejs/adapter-auto`; for GitHub Pages or any static host, switch to
`@sveltejs/adapter-static`.

## Not included

- Arc Pro components (their license forbids redistribution).
- Activity heatmap and announcement bar: their ports aren't finished yet.

## Known issues

- A few components animate `filter: blur()` on a spring; when the spring overshoots, the browser
  logs an invalid `blur(-0.00…px)` keyframe and skips that frame. Nothing looks wrong.
- Ridgeline's label column is 52px (Arc's), so long series names get cut off: keep them short.
- Dropdown menu has no checkbox, radio or shortcut items yet.

## License

MIT, as Arc's free components are. Keep both copyright lines in [LICENSE](LICENSE).
