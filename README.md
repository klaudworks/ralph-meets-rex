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
mkdir -p .rex/workflows
cp plan/sample-workflow.min.yml .rex/workflows/min.loop.yml
rex run .rex/workflows/min.loop.yml "Implement feature X"
```

Resume later:

```bash
rex continue <run-id>
```

## Commands

- `rex run <workflow-path> "task" [--var key=value ...] [--allow-all|--no-allow-all]`
- `rex continue <run-id> [--step <step-id>] [--provider <provider>] [--session-id <id>]`
- `rex completion <bash|zsh|fish>`
- `rex complete <run-id|workflow> [partial]` (used by shell completion)

## Notes

- Run state is stored in `.rex/runs/*.json`.
- Workflow completions are sourced from `.rex/workflows/*.yml|*.yaml`.
- Run id completions are sourced from `.rex/runs/*.json`.
