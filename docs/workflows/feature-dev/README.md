# Single Feature Development

<p align="center">
  <img src="flow.svg" width="720" />
</p>

Implement a single feature end-to-end. A planner validates and designs the approach, a developer implements it, and a reviewer verifies the result. The reviewer can send the developer back for revisions or escalate to a human.

## Get Started

```bash
rmr install feature-dev
```

Run with an inline task:

```bash
rmr run .rmr/workflows/feature-dev/workflow.yaml --task "Add rate limiting to the API"
```

Or point to a task file:

```bash
rmr run .rmr/workflows/feature-dev/workflow.yaml --task-file task.md
```

## Agents

| Agent     | File               | Role                                                                         |
| --------- | ------------------ | ---------------------------------------------------------------------------- |
| planner   | [`planner-agent.md`](../../../examples/workflows/feature-dev/planner-agent.md) | Validates the task, researches the codebase, produces an implementation plan |
| developer | [`tackle-agent.md`](../../../examples/workflows/feature-dev/tackle-agent.md)  | Implements the plan, runs tests, commits                                     |
| reviewer  | [`review-agent.md`](../../../examples/workflows/feature-dev/review-agent.md)  | Reviews the diff, approves / requests changes / escalates                    |

All agent prompts live in `.rmr/workflows/feature-dev/` next to `workflow.yaml`. Edit them to customize behavior.
