# Ball-Knowledge
An app that will teach you ball knowledge

## Getting started

Requires [Node.js](https://nodejs.org/) 22.12 or newer.

```sh
npm ci           # install dependencies from the lockfile
npm run check    # format check, lint, typecheck, and tests (what CI runs)
```

## Where things are

- [`docs/PRD.md`](docs/PRD.md): the product spec
- [`docs/ROADMAP.md`](docs/ROADMAP.md): the phased build plan and current status
- [`docs/decisions/`](docs/decisions/README.md): decision records (sport, stack, backend, data, media)
- `packages/core`: the domain model
- [`docs/content-authoring.md`](docs/content-authoring.md): how to write and fact-check content
- `content/`: lessons, facts, and exercises (YAML)
- `packages/content-tools`: content validator and bundler (`npm run content:check`)
- `packages/retention`: the retention engine
