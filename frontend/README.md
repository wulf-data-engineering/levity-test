# Tool-Set Project Frontend

This directory contains the frontend application using **SvelteKit** with **TypeScript**.
It is designed to be a self-contained static single-page application.

The application is rendered with **static-site generation (SSG)** via `@sveltejs/adapter-static`.

**Node.js** with **npm** is used as runtime.

**Vitest** is used for unit tests placed alongside the source code in `src/`.

**Playwright** is used for end-to-end and UI testing in `e2e/`.

**shadcn/svelte** is used for UI components and styling installing its components in `src/lib/components/ui/`.

**Storybook** is used for a UI component library, see `.storybook`.

## Developing

- `npm install`: Installs the dependencies.
- `npm run dev`: Starts the development server.
- `npm run storybook`: Starts Storybook for UI component development.
- `npx shadcn-svelte@latest add ...` adds new components from shadcn/svelte.

## Building

- `npm run build`: Builds the application for production.
- `npm run preview`: Previews the production build locally.
- `npm run prepare`: Synchronizes SvelteKit's generated types (usually run automatically by npm).
- `npm run format`: Formats all files with Prettier.
- `npm run gen:proto`: Generates code from protobuf definitions.

## Testing

- `npm run test`: Runs all unit and end-to-end tests once.
- `npm run test:unit`: Runs unit tests with Vitest in watch mode.
- `npm run test:e2e`: Runs end-to-end tests with Playwright (requires `npx playwright install`).
- `npm run check`: Runs Svelte's type checker to find issues in your code.
- `npm run lint`: Checks for formatting and linting errors.
