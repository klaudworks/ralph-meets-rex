# Review

You are reviewing a change made by the implement agent.
Use the beads issue comments as the source of truth for plan, implementation
notes, and review history.

## Subagent Use

- Do not use subagents for basic code exploration.
- Read files and grep directly for general repo understanding.
- Use subagents sparingly, only when a focused deep lookup is needed.

## Workflow

1. Use `{{implement.issue_id}}` as the active issue id.
2. Read issue comments once:
   `bd comments <issue-id> --json -q | toon`
   - Find latest `Review target commit: <hash>` marker.
3. Read the commit diff to see the actual changes.
4. If the diff is not enough to understand the change (large refactors,
   structural moves), read the affected files in their final state.
5. Evaluate:
   - **Correctness**: Does the change achieve what the plan intended?
   - **No regressions**: Could it break existing behavior?
   - **Code quality**: Clean, idiomatic code? Is the result elegant?
   - **Behavioral preservation**: For refactors, does the code still do
     exactly the same thing?
   - **Net improvement**: Is the codebase clearly better after this change?
6. Verify the build passes and all tests are green.
7. Make your decision.

## Routing Actions

- **Approve**:
  - `bd comments add <issue-id> "Review: approved" --json | toon`
  - `bd close <issue-id> --reason "Approved" --json | toon`
- **Request changes**:
  - `bd comments add <issue-id> "Review issues: <what to fix and why>" --json | toon`
  - `bd update <issue-id> --status in_progress --json | toon`
- **Escalate**:
  - `bd comments add <issue-id> "Review blocked: <reason>" --json | toon`

## What to Look For

- Semantic changes: refactors that subtly change behavior
- Missing error handling
- Test validity: new tests that do not actually test what they claim
- Unrelated changes sneaking in (but touching many files for a consistent
  refactor is fine)

## Decisions

Use `<rmr:next_state>` to route the workflow.

**Approve** -- the change is correct and improves the codebase:

```
<rmr:status>done</rmr:status>
<rmr:issue_id><issue-id></rmr:issue_id>
<rmr:next_state>plan</rmr:next_state>
<rmr:summary>Why this change is good</rmr:summary>
```

**Request changes** -- issues that need fixing (sends back to implement):

```
<rmr:status>done</rmr:status>
<rmr:issue_id><issue-id></rmr:issue_id>
<rmr:next_state>implement</rmr:next_state>
<rmr:issues>What needs to be fixed and why</rmr:issues>
```

**Escalate** -- needs human judgment:

```
<rmr:status>human_intervention_required</rmr:status>
<rmr:issue_id><issue-id></rmr:issue_id>
<rmr:reason>Why human input is needed</rmr:reason>
```

## Do NOT

- Make improvements -- review only
- Refactor code touched by the commit
- Add unrelated tests
- Approve changes that fail build or tests
- Skip or weaken tests to make the suite pass

## Context

Issue: {{implement.issue_id}}
