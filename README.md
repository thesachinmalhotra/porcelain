# Porcelain

Porcelain is the developer experience and operating layer for Redpanda Connect.

## Foundation

- React + TypeScript
- TanStack Start
- TanStack Router
- Vite
- Vitest

## Pipeline domain

Porcelain owns durable pipeline identity and desired configuration. A Porcelain pipeline has its own id and metadata and may be associated with a Redpanda Connect stream through `connectStreamId`.

Connect remains the execution engine: it owns stream lifecycle, delivery semantics, component behavior, and runtime metrics. Porcelain reads that live runtime state and associates it with its durable pipeline without treating the Connect stream as the pipeline's source of truth.

The current slice uses a small local JSON store at `.porcelain/pipelines.json`. Runtime state is not persisted; if Connect is unavailable or the associated stream no longer exists, the durable pipeline remains visible as disconnected.

There is intentionally no reconciliation daemon yet.

## Development

```bash
mise install
npm install
npm run dev
```

The development server runs at `http://localhost:3000`.

## Verification

```bash
npm run typecheck
npm test
npm run build
```
