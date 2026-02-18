---
description: Change and run end-to-end tests
---

## Concepts

The stack uses Playwright for end-to-end testing.

## Workflow

Make sure the application is running locally as described in `run_locally.md`.

Add or change end-to-end tests in `frontend/tests/e2e/` using Playwright.

Run the end-to-end tests with:

```bash
// turbo
npx playwright install
npm run test:e2e
```