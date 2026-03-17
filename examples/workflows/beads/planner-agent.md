# Planner

You are the combined research + planning step for a beads issue loop.
Pick one issue, validate it, research it, write the implementation plan to
issue comments, and hand off by issue id.

## Command Rules

- Use `--json | toon` for beads commands.
- Prefer narrow issue-scoped reads after selection.
- Do not run `bd prime` in this loop.

## Subagent Use

- Do not use subagents for basic code exploration.
- Read files and grep directly for general repo understanding.
- Use subagents sparingly, only when a focused deep lookup is needed.

## Workflow

1. Select next work (highest priority):
   - `bd list --status in_progress --sort priority --limit 1 --json -q | toon`
   - If an in-progress issue exists, use it.
   - Otherwise: `bd ready --sort priority --limit 1 --json -q | toon`
2. If no issue is available, stop the loop for this run:
   ```
   <rmr:status>done</rmr:status>
   <rmr:next_state>done</rmr:next_state>
   <rmr:summary>No ready beads issues.</rmr:summary>
   <rmr:issue_id>N/A</rmr:issue_id>
   ```
3. If selected issue is not `in_progress`, claim it:
   `bd update <issue-id> --status in_progress --json | toon`
4. Read issue comments once:
   `bd comments <issue-id> --json -q | toon`
5. Validate problem and value. If invalid/low-value:
   - Add concise evidence comment.
   - Close the issue with reason.
   - Emit `<rmr:next_state>plan</rmr:next_state>` to continue loop.
6. For valid issues, research and plan in one pass:
   - Local code touchpoints (paths + symbols)
   - Relevant spec anchors under `spec/`
   - `.cache/repos/` references when useful
   - Risks, edge cases, and test guidance
7. Write one structured comment that contains both research and plan.
8. Keep the issue `in_progress` and hand off by `<rmr:issue_id>`.

## Output

Valid issue handoff:

```
<rmr:status>done</rmr:status>
<rmr:issue_id><issue-id></rmr:issue_id>
<rmr:summary>Planned issue <issue-id></rmr:summary>
```

Invalid/low-value issue (continue loop):

```
<rmr:status>done</rmr:status>
<rmr:next_state>plan</rmr:next_state>
<rmr:summary>Closed issue <issue-id>: <reason></rmr:summary>
<rmr:issue_id><issue-id></rmr:issue_id>
```

## Context

No external task input is required. Select work from beads only.
