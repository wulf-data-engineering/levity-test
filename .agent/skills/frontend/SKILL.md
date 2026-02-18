---
name: Frontend Development
description: Develop and test features in the frontend
---

## Concepts

The stack uses Svelte 5.

The stack uses static site generation.
Prefer pre-rendering where possible (`export const prerender = true;` in pages and layouts).
Do not use server load functions.
Avoid client load functions in pages that make sense for an unauthorized user.
Use placeholder content while loading data.

The stack uses https://shadcn-svelte.com/ components for UI.

The stack uses storybook to display styling & usage of shadcn/svelte and derived components.

Add or change pages and layouts in `frontend/src/routes/`.

Add or change shared code in `frontend/src/lib/`.

If new UI is introduced, check if existing shadcn/svelte components can be used:
https://shadcn-svelte.com/docs/components
If new shadcn/svelte components are needed, run `npx shadcn-svelte add <component-name>`.
If needed, make adjustments to the generated components in `frontend/src/lib/components/ui/<component-name>`.
Add a story in `frontend/src/lib/components/ui/<component-name>/<component-name>.stories.svelte` to describe
the component usage and styling in the project.

Add or change derived components in `frontend/src/lib/components/`.
Follow the structure of existing components:

- index.ts to export the component
- component.svelte for the Svelte component
- Component.stories.svelte for Storybook stories
- Component.test.svelte for an optional test component
- component.test.ts for unit tests using the Svelte testing-library

If code depends on local development or deployed AWS environment decide based on the `dev` value:

```typescript
import { dev } from "$app/environment";
```

Run `npm run test:unit` during development.

Consult @../workflows/run-locally.md to test the changes in the browser.
to test the changes in the browser.

## Tests

If you introduce a new feature or make a change it has to be reflected in tests.
If there are existing unit or end-to-end tests, extend or update them.
If not, evaluate if unit and/or end-to-end tests are appropriate to test the change.

## MCP Tools

The `svelte` MCP server is available to assist with Svelte 5 and SvelteKit development.

- Use `list-sections` and `get-documentation` to search for official documentation.
- Use `svelte-autofixer` to fix issues in Svelte components.

The `context7` MCP server is available for general frontend library documentation.

- Use `query-docs` to find documentation for TypeScript libraries (e.g., specific shadcn/svelte details not covered by the svelte server, or other util libraries).

## Final Checks (CRITICAL)

If you modified `frontend/package.json`, run `npm install` in `frontend/` to update the lock file.

At the end of development run `npm run format`, `npm run lint`, `npm run check`.
