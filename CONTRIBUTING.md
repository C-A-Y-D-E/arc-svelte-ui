# Contributing: porting an Arc component

Only Arc's **free** components may be ported (MIT). Arc Pro components, and ports of them, may not be
published here: their license forbids it. Check the component's page on uiarc.dev before you start.

Get the React source of a component:

```sh
mkdir -p /tmp/arc-src/<name> && curl -sL https://uiarc.dev/r/<name>.json | python3 -c "import json,sys,os; d=json.load(sys.stdin); [open('/tmp/arc-src/<name>/'+os.path.basename(f['path']),'w').write(f['content']) for f in d['files']]"
```

The full list of components is at https://uiarc.dev/r/registry.json.

React sources: /tmp/arc-src/<name>/ (a .tsx and a .module.css per component; read them fully).
Usage docs for each component: `curl -sL https://uiarc.dev/components/<name>/markdown` (props, examples).
Live look: https://uiarc.dev/components/<name>

Goal: each Svelte component looks and behaves the same as the Arc original: same props, same states,
same motion. A faithful port, not a redesign.

## Study these first (already done, do NOT edit them)

- `src/lib/components/arc/button/Button.svelte` + `index.ts`: the reference port. Compare it with
  /tmp/arc-src/button/button.tsx to see every convention below applied.
- `src/lib/components/arc/motion.ts`: motionTokens, ease, isReducedMotion, presence, pressScale, moveIndicator.
- `src/lib/components/arc/foundation.css`: all Arc tokens, prefixed `--arc-`. Loaded globally.
- `src/routes/gallery/Demo.svelte`, `src/routes/gallery/+layout.svelte`, `src/routes/gallery/sections/Button.svelte`.

Shared files you must not edit: motion.ts, foundation.css, theme.css, strings.ts, button/,
routes/gallery/+layout.svelte, routes/gallery/Demo.svelte. If you need a shared
helper that doesn't exist, write it inside one of your own component folders and mention it in your report.
Do not add npm packages beyond bits-ui, motion and @lucide/svelte without discussing it first.

## Files

- `src/lib/components/arc/<kebab-name>/<PascalName>.svelte` (+ extra part files for compound components)
- `src/lib/components/arc/<kebab-name>/index.ts` barrel: `export { default as Name } from './Name.svelte';` plus exported types.
- Components that import other Arc components use relative imports (`'../input'`, `'../motion'`): a
  component installs from the registry into the same folder layout, so relative imports always resolve.
- Every word a component shows or announces goes in `strings.ts` (a function per text) and is read as
  `strings.name(...)`; never hard-code English in a component.
- Demo section: `src/routes/gallery/sections/<SectionName>.svelte` with one or more `<Demo title="Component · aspect">`
  per component, mirroring the examples in the Arc markdown docs. Use `wide` on Demo for big components.
- Group preview page: `src/routes/gallery/<group-slug>/+page.svelte` that just renders your section, and
  a link to it in `src/routes/+layout.svelte`'s `PAGES`.

## Language and style

- `<script lang="ts">`, Svelte 5 runes ($props, $state, $derived, $effect, $bindable). Types in `<script module lang="ts">` when exported.
- Keep Arc's public API names: `variant`, `size`, `value`, `defaultValue`, `onValueChange`, `disabled`...
  `className` becomes `class`. `children`/render props become Snippets. Controlled + uncontrolled:
  `value = $bindable(defaultValue)` plus the `on...Change` callback. Spread remaining HTML attributes onto the root.
- Clean code: meaningful names, magic numbers become named constants, small functions, no dead code.
  Keep Arc's comments that explain WHY (they are good); do not add comments restating code.
- Format with `npx prettier --write <your files>` (tabs; the repo config).

## CSS

- Move the .module.css into the component's `<style>`. Class names become kebab-case (`labelSlot` -> `label-slot`).
- Prefix every Arc token: `var(--surface)` -> `var(--arc-surface)`, same for background, surface-raised, surface-muted,
  foreground, text-secondary, text-muted, border, border-subtle, border-strong, accent, accent-strong, accent-subtle,
  accent-foreground, control-_, focus-ring, success, warning, danger, shadow-_, space-_, radius-_, control-height-_,
  font-_, text-xs..text-5xl, tracking-_, leading-_, ease-_, duration-_, series-1..4, neutral-* (neutral-N is NOT defined:
  replace with the nearest role token). Grep your output for `var(--` without `arc-` to make sure none are left
  (component-local custom properties are fine; prefix those with the component name).
- Corners: keep `var(--arc-radius-control|panel|surface)` (never a fixed px radius); `--arc-radius-pill` stays
  round for switches, badges and avatars.
- Additions not in Arc are kept small and marked "Not in Arc" in the code (for example TreeView
  `disclosure="end"`, ToastStack `top-center`, Button `buy`/`sell`). Re-apply them if a component is re-ported.
- Sizes and padding: use `--arc-control-height-*` and `--arc-space-*`, never fixed px, so an app can make
  everything denser by overriding the tokens.
- `:root[data-theme="dark"] X` -> `:global(.dark) X`. Styles for elements rendered by child components or snippets
  need `:global(...)` scoped under your own class (e.g. `.label-phase :global(svg)`).
- Keep `@media (prefers-reduced-motion: reduce)` and hover media queries as they are.
- Focus: keep Arc's `outline: ... var(--focus-ring)` rules as-is (prefixed); `--arc-focus-ring` decides how visible
  they are.
- Gradients: `--arc-gradient*` tokens do not exist (Arc's brand gradients are left out); replace decorative
  gradients with solid colours. Functional gradients (edge-fade masks, a shimmer sweep, chart fills that encode data) may stay:
  list them in your report.

## React/Motion -> Svelte mapping

| React / Motion                                                                                       | Svelte                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `motionTokens` from "@/lib/motion-tokens"                                                            | `import { motionTokens, ease } from '../motion'` (durations in seconds; `ease.enter` etc. are easing fns). Pass `ease: motionTokens.ease.standard` directly to motion's animate; never spread it (`[...x]` loses the tuple type and fails svelte-check).                                                                                                                       |
| `useReducedMotion()`                                                                                 | `isReducedMotion()` (reactive; fine inside $derived/$effect/templates)                                                                                                                                                                                                                                                                                                         |
| `<AnimatePresence>` + `motion.x initial/exit`                                                        | `{#if}` / `{#key}` + `in:presence={{ y: 4, blur: 4, ... }}` / `out:presence={{ ... }}` from '../motion'. Params describe the hidden state. Springs -> closest duration + `ease.enter`. `mode="popLayout"` -> `pop: true` (parent needs `position: relative`). `mode="wait"` -> put out/in with `delay` on the in. `initial={false}` is Svelte's default for local transitions. |
| `animate={{...}}` driven by state                                                                    | `$effect(() => { animate(node, {...}, transition) })` with `animate` from 'motion' (vanilla; accepts the same transition objects incl. `motionTokens.spring.*` and per-value transitions). Or plain CSS transitions when Arc's CSS already does it.                                                                                                                            |
| `useMotionValue` / `useTransform` / `useSpring` / `useMotionTemplate`                                | `$state` + `animate(from, to, { ...transition, onUpdate: v => x = v })`, or `motionValue`/`springValue`/`transformValue`/`styleEffect` from 'motion', or `Spring`/`Tween` from 'svelte/motion'. Pick the simplest that matches the motion.                                                                                                                                     |
| `whileTap`                                                                                           | `{@attach pressScale(depth)}` from '../motion'                                                                                                                                                                                                                                                                                                                                 |
| `layoutId` shared highlight                                                                          | one indicator element + `moveIndicator(indicator, target, { instant })` from '../motion' in an $effect; first placement `instant: true`                                                                                                                                                                                                                                        |
| `layout` / `LayoutGroup` (size/position changes)                                                     | FLIP: measure in `$effect.pre`/before change, then `animate()` from 'motion' after; keyed lists: `animate:flip` from 'svelte/animate' with `easing: ease.standard`                                                                                                                                                                                                             |
| `useInView`                                                                                          | `inView(node, cb, opts)` from 'motion' inside an attachment or $effect                                                                                                                                                                                                                                                                                                         |
| `drag` / gestures                                                                                    | pointer events + `setPointerCapture`; springs via motion `animate`                                                                                                                                                                                                                                                                                                             |
| `useIsPresent`                                                                                       | mark leaving nodes `aria-hidden` (outro) if needed                                                                                                                                                                                                                                                                                                                             |
| `createPortal` (react-dom)                                                                           | bits-ui `Portal` or an attachment that appends the node to `document.body`                                                                                                                                                                                                                                                                                                     |
| `forwardRef` / refs                                                                                  | `ref = $bindable(null)` + `bind:this`                                                                                                                                                                                                                                                                                                                                          |
| `useEffect` / `useLayoutEffect`                                                                      | `$effect` / `$effect.pre`; cleanup by returning a function                                                                                                                                                                                                                                                                                                                     |
| `useId`                                                                                              | `$props.id()`                                                                                                                                                                                                                                                                                                                                                                  |
| Radix primitives (Dialog, DropdownMenu, Select, Checkbox, Switch, Accordion, Popover, Tooltip, Tabs) | bits-ui v2 (installed). Types: node_modules/bits-ui/dist/bits/<name>. For exit animations use `forceMount` + `child` snippet + `{#if open}` + transitions.                                                                                                                                                              |
| lucide-react `import { X } from "lucide-react"`                                                      | `import XIcon from '@lucide/svelte/icons/x'` (kebab-case file names; same `size`/`strokeWidth` props)                                                                                                                                                                                                                                                                          |
| next/image, next/link                                                                                | `<img>`, `<a>`                                                                                                                                                                                                                                                                                                                                                                 |

## Verification (required before a pull request)

1. `pnpm check`: zero errors, and no new warnings from your files.
2. `pnpm registry`: your component gets a `static/r/<name>.json` that lists the packages and components it
   imports.
3. `pnpm dev`, then open your gallery page in a browser, light and dark (the toggle in the header): every demo
   renders, every interaction works, and the console stays clean. A Playwright script is the quickest way to
   check interactions and catch console errors:
   ```js
   import { chromium } from '@playwright/test';
   const browser = await chromium.launch();
   const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
   const errors = [];
   page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
   page.on('pageerror', (e) => errors.push(e.message));
   await page.goto('http://localhost:5173/gallery/<group-slug>', { waitUntil: 'networkidle' });
   // ... exercise interactions (click, type, hover, open/close overlays)
   await page.screenshot({ path: '/tmp/arc-<group-slug>.png', fullPage: true });
   console.log('errors', JSON.stringify(errors));
   await browser.close();
   ```
4. Compare the screenshots with the Arc original (https://uiarc.dev/components/<name>). Fix what looks off.

## In the pull request

- Components ported (and any not finished, with the reason).
- Deviations from Arc in behaviour or look, and why.
- Any functional gradients kept.
- Any local helper you wrote that other components could share.
- Verification results: svelte-check errors in your files (should be 0), console errors (should be 0).
