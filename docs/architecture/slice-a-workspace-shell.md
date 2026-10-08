# Slice A - Pipeline Workspace Shell

## Intent

Make the Pipeline Workspace a dedicated spatial authoring environment. The canvas is the primary work surface; Porcelain chrome provides orientation, insertion, contextual configuration, runtime awareness, and publication controls without competing with the pipeline.

## Product references

Figma establishes the workspace grammar: navigation/left panel, canvas, contextual right properties panel, toolbar, and minimised chrome. Figma also uses persistent view state and expands the properties panel when an object is selected.

Linear establishes the application grammar: consistent headers and view controls, dimmer navigation chrome, restrained borders, compact iconography, command access, and contextual actions.

## Implemented

- compact pipeline header with breadcrumb, runtime state, draft state, command entry, validation and publish
- component library and inspector can be independently collapsed
- Cmd/Ctrl + backslash toggles both side panels
- [ toggles the component library
- ] toggles the inspector
- clicking a node opens its inspector
- clicking empty canvas clears selection and closes the inspector
- panel state persists per pipeline as presentation-only browser state
- node positions persist per pipeline as presentation-only browser state
- viewport pan/zoom persists per pipeline as presentation-only browser state
- pipeline changes remount the canvas so each pipeline restores its own spatial state
- React Flow uses its design-tool interaction model: scroll pan, Cmd/Ctrl-scroll zoom, drag selection, and Space/middle-button pan
- the canvas toolbar floats over the canvas instead of consuming a permanent content row
- runtime metrics remain available through the inspector rather than occupying permanent canvas space
- native Connect configuration and runtime boundaries remain unchanged

## Architecture boundary

Porcelain application -> Pipeline Workspace -> spatial presentation and interaction -> native Connect authoring boundary -> Redpanda Connect

Workspace presentation state is intentionally separate from pipeline semantics:

pipeline config != canvas positions != viewport != panel visibility

The workspace state is browser-local UI state. It must never become an alternate pipeline representation or execution state.

## Explicit non-goals

- no second pipeline model
- no custom runtime
- no custom graph execution
- no custom Connect component catalogue
- no new semantic configuration format
- no undo/redo system yet
- no contextual menu system yet
- no multi-selection authoring system yet
- no test/publish/runtime feature expansion

## Verification

- mise exec -- npm run typecheck
- git diff --check

Full repository verification remains the final gate before commit.
