# Porcelain UI-04 ? Product Shell

## Objective

Turn the existing Porcelain runtime and authoring capabilities into one coherent operating environment by composing the stack already in use.

The shell does not own routing, runtime semantics, pipeline state, or a new application framework.

## Product contract

- TanStack Router owns navigation state.
- TanStack Start route loaders/server functions remain the data boundary.
- Redpanda Connect remains authoritative for runtime/configuration semantics.
- Existing UI-02 tokens and UI-03 primitives remain the visual foundation.
- The shell owns spatial hierarchy, navigation presentation, responsive/collapsed presentation state, and shared route-header grammar.
- Pipeline authoring remains a specialised workspace rather than being forced into the generic page shell.

## Implemented

### Application shell

- Persistent left navigation with Operate and Discover groups.
- Workspace identity and local Redpanda Connect status.
- Router-native active navigation via TanStack Router Link active props.
- Sidebar collapse/expand control.
- Collapsed presentation state persisted in localStorage.
- Accessible labels/title fallbacks when collapsed.
- Responsive collapsed sidebar at narrow widths.
- Reduced-motion handling.

### Shared route header

Added `ViewHeader` for ordinary application routes:

```
EYEBROW
Title                                      actions
Supporting description
```

Migrated Overview, Runtime, Activity, Components, Event schemas, Settings, and Connect streams.

Pipeline authoring keeps its existing specialised header.

### SSR hygiene

Settings now guards browser-only localStorage access during initial render.

## Deliberately not built

- Command palette.
- New state-management library.
- New component catalogue.
- React Flow migration.
- Pipeline graph semantics.
- Runtime/reconciliation machinery.
- Radix/shadcn/Tailwind/StyleX adoption.
- Animation framework.

Those belong to later product work or existing upstream capabilities.

## Verification

- Node 22.22.2.
- Typecheck passes.
- Full Vitest suite passes: 18 files / 77 tests, with 2 smoke files skipped in normal mode.
- Production client/SSR/Nitro build passes.
- `git diff --check` passes.
- AppShell tests cover rendering, persisted collapse state, and TanStack Router active navigation.
