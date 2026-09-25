# Porcelain UI-01 + UI-02 — Visual System Audit & Foundation

**Date:** 2026-09-25  
**Branch:** `feat/ui-refresh-dx`  
**HEAD:** `b600b156d861064a7c80e871143ce5353fd107d0`

## UI-01 — Audit

### Current state

The product UI is functionally coherent but visually transitional. The application already has persistent chrome, a dense pipeline workspace, native Connect authoring, validation/publish/runtime state, and the Overview, Runtime, Activity, Components, Schemas, Streams and Settings routes.

The **pipeline workspace is the correct product center**. The secondary routes remain first-generation operational screens.

### Findings

1. **Two visual systems coexist.** `src/styles.css` contains an earlier application layer and a later workspace-refresh layer. The latter overrides much of the former instead of replacing it.
2. **Tokens are not authoritative.** A refresh `:root` exists, but components still mix tokens with literal colors, spacing, radii and shadows.
3. **Chroma is doing too much work.** Blue/lavender values currently carry primary action, active navigation, topology selection, icons and focus. That creates the exact generic AI-dashboard look we want to avoid.
4. **Elevation is inconsistent.** The intended reference is surface progression + hairline borders + limited overlay shadows; the current UI mixes this with chromatic selection and stronger shadows.
5. **Geometry is close but not systematized.** Compact values already dominate, but there is no explicit spacing/radius contract.
6. **Typography needs hierarchy, not weight.** Inter is UI text; DM Mono is technical metadata. The product should stay in the 400/500/600 range.

### Product rule

Make the architecture visible through state and interaction:

`Porcelain desired authoring → Connect validation → Connect runtime`

not through decoration. This preserves the roadmap boundary: Porcelain owns durable desired state; Connect owns execution/runtime behavior.

## UI-02 — Token contract

### Surfaces

| Token | Value | Role |
|---|---|---|
| `--color-void` | `#08090a` | application canvas |
| `--color-carbon` | `#0f1011` | primary contained surfaces |
| `--color-obsidian` | `#161718` | nested/elevated surfaces |
| `--color-slate` | `#23252a` | interactive/selected neutral |

### Neutrals

`#23252a → #383b3f → #62666d → #8a8f98 → #d0d6e0 → #e5e5e6 → #ffffff`

These form the structural/text ladder.

### Semantic color

- Success: `#3fa46a`
- Warning: `#b58a4d`
- Danger: `#c9636c`
- Primary action: restrained acid lime `#d9e91f`

The lime accent is restricted to primary actions and action affordances. It is not a decorative theme color.

### Rhythm

4px base unit:

`4 / 8 / 12 / 16 / 20 / 24 / 32 / 48`

8px is the default control/list gap, 12px the standard inset, 16px section spacing, 24px major surface padding, and 48px reserved for major page/empty-state transitions.

### Radius

`4 / 6 / 8 / 12px`

12px is the maximum. No 16px+ application cards.

### Elevation

Normal surfaces use 1px structural/inset borders. A literal 0.5px border is intentionally not part of the implementation contract because physical rendering varies with device pixel ratio. Outer shadow is reserved for transient overlays.

### Explicitly prohibited

- decorative blue/purple gradients;
- chromatic body text;
- glow as hierarchy;
- heavy 700+ typography;
- large-radius application cards;
- shadow stacks on normal panels;
- adding a styling framework just to imitate another product.

## Implementation boundary

UI-01/UI-02 introduce **no new runtime dependency** and no product/domain changes. The next phase should define primitives and interaction contracts, then use the pipeline workspace as the reference implementation.
