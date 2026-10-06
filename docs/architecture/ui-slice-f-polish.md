# UI Slice F - interaction polish

## Intent

Slice F is the final presentation pass over the Pipeline Workspace. It does not change pipeline semantics, the Connect boundary, authoring state, or runtime behaviour. Its job is to make the existing product feel deliberate under repeated, high-frequency use.

The interaction language is intentionally restrained:

- immediate feedback for controls;
- short, low-amplitude press feedback;
- slightly longer surface transitions;
- opacity and small spatial offsets for contextual surfaces;
- no bounce, overshoot, gratuitous scale, or decorative motion;
- keyboard focus remains explicit;
- reduced-motion preferences remove non-essential movement.

## Motion contract

| Use | Duration | Easing | Treatment |
| --- | ---: | --- | --- |
| Press / tactile cue | 80ms | ease-press | 1px translate only |
| Hover / field feedback | 120ms | standard | colour, border, shadow, opacity |
| Control state | 150ms | standard | button/tab state |
| Surface enter | 180ms | emphasised | opacity + 4-5px translation |
| Panel movement | 180ms | emphasised | grid width + content offset |
| Long ambient state | 1.8s | standard | very subtle dirty-state pulse |

Motion is applied primarily to compositor-friendly properties. Layout animation is limited to the workspace panel grid because the panel itself is the interaction.

## State hierarchy

Every dense workspace surface should distinguish:

1. default;
2. hover;
3. pressed;
4. keyboard focus;
5. selected/active;
6. disabled;
7. loading;
8. success;
9. warning/error;
10. empty.

The visual hierarchy should be carried by geometry, contrast and small state indicators rather than large effects.

## Canvas

React Flow remains the spatial interaction primitive. Slice F only tunes presentation:

- selected nodes gain a quiet elevation/contrast treatment;
- handles become more visible on hover/selection;
- selection rectangles remain low-contrast;
- contextual toolbars enter quickly;
- node press feedback is 1px, never scale;
- edges transition their visual state without inventing a second graph renderer.

## Inspector

The inspector treats configuration as the primary work surface:

- field hover is barely perceptible;
- dirty state is a small persistent signal;
- invalid fields use local border treatment plus diagnostics;
- controls retain stable geometry while their state changes;
- focus rings are keyboard-only.

## Command and contextual surfaces

Command palette, node toolbar, context menus and modal surfaces share one entrance language. Linear's contextual-menu philosophy is especially important: actions should appear close to the object being acted upon, and interaction should not punish the shortest mouse path.

## Loading, empty and error states

Loading uses the existing aria-busy contract on buttons and a reusable .ui-skeleton primitive. Empty states retain their geometry and explain the next useful action. Errors wrap safely and remain local to the surface that can resolve them.

## Responsive behaviour

The editor progressively compresses rather than shrinking the desktop composition:

- below 1020px the workspace loses fixed minimum width;
- below 860px the inspector becomes an overlay and the library becomes compact;
- below 680px the top bar becomes action-minimal and the inspector becomes a mobile-width surface;
- canvas remains the primary workspace.

## Accessibility

:focus-visible is the canonical focus treatment. prefers-reduced-motion: reduce disables non-essential animation and transition duration while preserving state changes and layout.

## Design references

The interaction direction was distilled from:

- Linear's 2026 UI refresh and design-reset work: hierarchy, density, calmer navigation, consistent headers and view controls.
- Linear's contextual-menu engineering: shortest-path interaction and safe-area thinking for nested menus.
- Figma interactive components: explicit component states and state-level interaction definitions.
- React Flow design-tool viewport guidance and selected-node styling.
- React documentation for explicit visual state modelling and keyboard-only focus indication.

The implementation deliberately avoids copying a visual skin. Porcelain keeps its own dark, compact, native-Connect identity while adopting the interaction discipline behind those products.
