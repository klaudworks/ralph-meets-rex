# Beads Issue Loop

Run an autonomous issue loop backed by Beads. The planner picks the next issue,
the implementer ships a single focused commit, and the reviewer either approves,
requests changes, or escalates to a human.

Unlike `feature-dev`, this workflow does not require `--task`. Work is selected
directly from your Beads queue.

## Prerequisites

This workflow uses `bd` and `toon` commands directly, so both must be installed
and available on your `PATH`.

Install both CLIs (npm option):

```bash
npm install -g @beads/bd
npm install -g @toon-format/cli
```

- Beads docs and install options: <https://github.com/steveyegge/beads>
- Toon docs and install options: <https://github.com/toon-format/toon?tab=readme-ov-file>

Initialize Beads in your project before running this workflow:

```bash
bd init
```

## Get Started

```bash
rmr install beads
```

Run the workflow:

```bash
rmr run .rmr/workflows/beads/workflow.yaml
```

The run keeps looping until there are no ready/in-progress issues to process,
or until a step emits `HUMAN_INTERVENTION_REQUIRED`.

## Files

| File | Role |
| ---- | ---- |
| [`workflow.yaml`](../../../examples/workflows/beads/workflow.yaml) | Workflow definition for the continuous beads loop |
| [`planner-agent.md`](../../../examples/workflows/beads/planner-agent.md) | Selects issue, validates it, researches, and writes implementation plan |
| [`implement-agent.md`](../../../examples/workflows/beads/implement-agent.md) | Implements planned issue, verifies build/tests, posts handoff comment |
| [`review-agent.md`](../../../examples/workflows/beads/review-agent.md) | Reviews commit and routes to approve, rework, or human intervention |

All files live in `.rmr/workflows/beads/` after install. Edit them to customize
behavior.
