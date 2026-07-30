# Contributing

Thanks for considering a contribution. Issues, bug reports and pull requests are all welcome, and
small PRs are easier to review than big ones.

## Getting set up

Requires Node.js 18.17 or newer.

```bash
git clone https://github.com/vojtisprime11/mcp-server-web-fetcher.git
cd mcp-server-web-fetcher
npm install
npm test
```

Useful scripts:

| Command                           | What it does                                       |
| --------------------------------- | -------------------------------------------------- |
| `npm run dev`                     | Runs the server from source with `tsx watch`.      |
| `npm run build`                   | Compiles to `dist/` (NodeNext ESM).                |
| `npm test`                        | Runs the Vitest suite once.                        |
| `npm run test:watch`              | Watch mode.                                        |
| `npm run test:coverage`           | Coverage with enforced thresholds.                 |
| `npm run typecheck`               | `tsc --noEmit` over `src` and `tests`.             |
| `npm run lint` / `lint:fix`       | ESLint.                                            |
| `npm run format` / `format:check` | Prettier.                                          |
| `npm run inspect`                 | MCP Inspector against `dist/index.js`.             |
| `node scripts/smoke.mjs <url>`    | Live end-to-end check through a real stdio client. |

## Before opening a pull request

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

CI runs the same checks on Node 18, 20, 22 and 24, so a green local run usually means a green PR.

## Conventions

- **TypeScript strict mode**, no `any`, no non-null assertions in new code.
- **Tests stay offline.** Never call the real network from a test; inject a `fetchImpl` stub
  (see `tests/helpers.ts`). `scripts/smoke.mjs` is the only place that touches the internet.
- **New tool or parameter?** Add its Zod schema to `src/types.ts`, keep input schemas `.strict()`,
  document the parameter in the README table, and cover it with a test.
- **Errors** go through `WebFetcherError` with an existing code where possible. New codes need a
  `recoveryHint` entry.
- **Comments explain why, not what.** Skip comments that restate the code.
- **Conventional Commits** for commit messages and PR titles:
  `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `perf:`, `chore:`.
- Update `CHANGELOG.md` under `## [Unreleased]` for user-visible changes.

## Reporting bugs

Please include the URL that misbehaved (if it is public), the tool and arguments used, the error
`code` you got back, plus your Node.js and OS versions. A failing test case is the fastest possible
bug report.

## Security issues

Do not open a public issue. Follow [SECURITY.md](SECURITY.md).

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
