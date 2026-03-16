# @klaudworks/rex

![Rex](docs/images/rex.jpg)

`rex` is a state-machine workflow orchestrator CLI.

It runs a YAML-defined flow step by step, tracks run state in `.rex/runs`, and lets you resume paused runs with provider/session overrides.

## Install

```bash
bun install
bun run build
npm link
```

## Quick start

```bash
rex install feature-dev
rex run .rex/workflows/feature-dev/workflow.yaml --task "Implement feature X"
```

Resume later:

```bash
rex continue <run-id>
```

## Commands

- `rex install <workflow-name>`
- `rex run <workflow-path> --task "task" [--var key=value ...] [--allow-all|--no-allow-all]`
- `rex continue <run-id> [--step <step-id>] [--provider <provider>] [--session-id <id>]`
- `rex completion <bash|zsh|fish>`
- `rex complete <run-id|workflow> [partial]` (used by shell completion)

## Notes

- Run state is stored in `.rex/runs/*.json`.
- Workflow completions are sourced from `.rex/workflows/*/workflow.yaml` (or `.yml`).
- Run id completions are sourced from `.rex/runs/*.json`.
- See `docs/workflows.md` for workflow folder layout and installation details.
