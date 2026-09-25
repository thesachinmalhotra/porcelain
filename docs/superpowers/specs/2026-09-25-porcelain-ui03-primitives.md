# Porcelain UI-03  Component & Interaction Primitives

## Purpose

Establish the small, canonical UI foundation that new Porcelain surfaces can use without creating a component-library dependency or a second visual system.

UI-03 consumes the UI-02 token contract. It does not reopen typography, colour, spacing, or surface decisions.

## Current audit

The repository currently has one shared component module (`src/components/app-shell.tsx`) and a large stylesheet containing repeated control rules. The pipeline workspace repeats button, icon-button, input, status, and tab markup directly. The inspector already has a real tab interaction and the workspace already has real modal/picker interactions.

The audit therefore supports a narrow primitive layer rather than a broad component catalogue.

## Canonical primitive inventory

### Implement in UI-03

- `Button`  primary, secondary, ghost, and danger-ghost actions; small and medium sizes; native button props preserved.
- `IconButton`  square action control with a required accessible label.
- `Input`  text/search-compatible native input with shared focus treatment.
- `TextArea`  multiline/native configuration editing control.
- `Select`  native select with shared control treatment; no custom select behaviour yet.
- `Badge`  compact neutral/status metadata.
- `Status`  semantic status dot + label; state colours remain semantic.
- `Divider`  structural separator.
- `Avatar`  compact identity mark.
- `KeyboardShortcut`  technical keyboard hint.
- `Tabs`  controlled, accessible tablist with keyboard navigation.
- `Panel`  structural surface primitive; no domain semantics.

### Define, but defer implementation

- `Tooltip`  defer until an actual contextual hint pattern exists.
- `Popover`  defer until a real anchored transient surface requires it.
- `Dialog` / `Sheet`  defer migration until the existing modal flows are ready to be unified.
- `CommandMenu`  defer until global command/search interaction is specified.
- `ContextMenu`  defer until a concrete contextual-action surface exists.

These are intentionally not speculative abstractions.

## Interaction contracts

- Native HTML semantics remain the default.
- `Button` never owns domain actions or async orchestration.
- `IconButton` requires an accessible name.
- `Tabs` exposes `role=tablist`, `role=tab`, `aria-selected`, and keyboard navigation with Arrow/Home/End.
- Focus treatment comes from UI-02 tokens; primitives do not invent per-component focus colours.
- Loading/disabled state is represented by native `disabled` plus `aria-busy` where applicable.
- Semantic status colour is never used as decoration.
- Primitive class composition is deterministic and local; no styling-from-a-distance API.

## Ownership boundary

Primitives own presentation and interaction mechanics only.

They do not own:

- pipeline state;
- Connect configuration semantics;
- validation;
- runtime lifecycle;
- publish/reconciliation behaviour;
- domain-specific terminology.

Porcelain-specific primitives such as `PipelineNode`, `RuntimeStatus`, `PublishControl`, and `ValidationMessage` remain feature/domain components and are not folded into this generic layer.

## Dependency decision

No Radix, shadcn, Tailwind, StyleX, Motion, or other UI runtime dependency is introduced in UI-03. The current product has enough native interaction surface to establish the contracts directly. External primitives can be evaluated later against a concrete interaction requirement.

## Adoption boundary

UI-03 establishes the canonical primitives and migrates the pipeline inspector's tab interaction plus representative workspace controls to them. Broad shell migration belongs to UI-04.

## Definition of done

- Primitive APIs are typed and small.
- Repeated pipeline-workspace controls use the canonical primitives where touched.
- Tabs have keyboard and ARIA coverage.
- Primitive behaviour has focused unit tests.
- No new visual language or dependency is introduced.
- Typecheck and the full existing test suite remain green.
- Production build remains green.
