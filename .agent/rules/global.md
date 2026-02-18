---
trigger: always_on
---

This is a monorepo.

- `.agent`: Your rules, skills and workflows.
- `frontend`: Static Svelte 5 page (TypeScript)
- `backend`: Lambda functions on AWS (Rust with cargo lambda)
- `infrastructure`: AWS CDK (TypeScript)
- `protocols`: API definitions (Protocol Buffers)
- `.github`: GitHub Actions for CI/CD
- `docker-compose.yml`: for local development
- `local`: volumes for local development (includes cognito-local config)

## Development

If you introduce a new feature or make a change it has to be reflected in tests.
If there are existing unit, integration or end-to-end tests, extend or update them.
If not, evaluate which test type or tests with different type are appropriate to test the change.

**CRITICAL**: If the user asks for a _plan_, **DO NOT** modify any files yet. Other agents might be planning or editing in parallel. Only modify files after the user approves the plan, and you switch to execution mode.

During feature development check if deployment workflow needs modifications.

**CRITICAL**: At the end of development run all final checks in the relevant skills (Frontend/Backend) before committing.
If the user asks for a commit, make sure your ran all the final checks on all changes first.

## MCP Tools

The `github` MCP server is available to assist with repository management.

- Use it to search issues, create comments, or manage pull requests if relevant to the task.