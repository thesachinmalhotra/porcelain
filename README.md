# Porcelain

Porcelain is the developer experience and operating layer for Redpanda Connect.

## Foundation

- React + TypeScript
- TanStack Start
- TanStack Router
- Vite
- Vitest

The current slice connects the application to a local Redpanda Connect Streams Mode instance and surfaces live pipeline lifecycle state.

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
