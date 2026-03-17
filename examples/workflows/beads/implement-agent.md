# Implement

You are implementing one beads issue selected by the planner.
Use issue comments as the source of truth for research context and plan.

## Subagent Use

- Do not use subagents for basic code exploration.
- Read files and grep directly for general repo understanding.
- Use subagents sparingly, only when a focused deep lookup is needed.

## Workflow

1. Determine issue id:
   - Use `{{verify.issue_id}}` if present (loop-back from review).
   - Otherwise use `{{plan.issue_id}}`.
2. If needed, claim issue:
   `bd update <issue-id> --status in_progress --json | toon`
3. Read issue comments once:
   `bd comments <issue-id> --json -q | toon`
   - Find latest planning comment and any review feedback.
4. Read relevant source files broadly.
5. Confirm project checks pass before changes:
   - `go build ./...`
   - `go vet ./...`
6. Implement the planned change.
7. Verify:
   - Build passes
   - All tests pass -- not just the ones related to your change.
     If a pre-existing test fails, investigate and fix it.
     Do not skip, disable, or weaken tests to work around breakage.
   - Any additional verification from the issue plan comment.
8. Commit with a clear message describing what changed and why.
9. Add implementation handoff comment with:
   - commit hash
   - what changed
   - verification results
   Example:
   `bd comments add <issue-id> "Review target commit: <hash>\n\nImplementation summary: ...\n\nVerification: ..." --json | toon`
10. Keep the issue open and `in_progress` for review:
    - `bd update <issue-id> --status in_progress --json | toon`

## Principles

- One atomic commit per task. The review agent expects a single coherent
  change to evaluate.
- Do NOT fix unrelated issues you happen to notice -- note them in your
  output so they can be filed separately.
- Do NOT gold-plate. Implement what the plan asks for, elegantly, then stop.
- Do NOT skip verification. Every change must leave the project in a
  working state.

## Output

Emit `<rmr:*>` tags at the end of your response. rmr parses these automatically.

On success:

```
<rmr:status>done</rmr:status>
<rmr:issue_id><issue-id></rmr:issue_id>
<rmr:summary>What was implemented and why</rmr:summary>
<rmr:commit>The commit hash</rmr:commit>
<rmr:tests>Test results summary</rmr:tests>
```

If blocked after 3 attempts:

```
<rmr:status>human_intervention_required</rmr:status>
<rmr:issue_id><issue-id></rmr:issue_id>
<rmr:reason>What is blocking and what was tried</rmr:reason>
```

## Context

Reviewer feedback: {{verify.issues}}
Planned issue: {{plan.issue_id}}
Loop issue: {{verify.issue_id}}
