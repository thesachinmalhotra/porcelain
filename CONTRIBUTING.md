# Contributing

Thanks for contributing to Porcelain.

## Development model

- `main` is protected.
- Work on a dedicated branch; do not develop directly on `main`.
- Open a pull request for changes targeting `main`.
- Keep changes focused and explain the reason for the change.
- Do not bypass failing CI. Diagnose the failure before changing the gate.

Suggested branch names:

```text
feat/<short-name>
fix/<short-name>
chore/<short-name>
docs/<short-name>
```

## Local setup

Porcelain uses Node.js 22+ and npm. If you use mise, the repository includes a `mise.toml` for the project toolchain.

```bash
mise install
npm ci
npm run dev
```

## Verification

Before opening a pull request:

```bash
npm run verify
```

This runs typechecking, the test suite, and the production build.

The GitHub Actions `quality` check is the merge gate and also exercises the real Redpanda Connect integration environment.

## Pull requests

A good pull request should answer:

1. What changed?
2. Why was it needed?
3. How was it verified?
4. What risks or compatibility concerns remain?

Keep unrelated refactors out of feature fixes unless they are necessary for correctness.

## Commit and history hygiene

Use clear, scoped commit messages such as:

```text
feat: ...
fix: ...
test: ...
refactor: ...
docs: ...
chore: ...
ci: ...
```

Never force-push `main`. Avoid rewriting shared feature-branch history once a pull request is under review.
