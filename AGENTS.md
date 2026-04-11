# Coding Session Rules — Follow These Throughout

Before writing any code:

1. Restate the exact task, success criteria, and what is out of scope. Ask if anything is unclear.
2. List all assumptions (framework, data shape, environment, dependencies). Flag uncertain ones.
3. Give a short plan — cause, approach, risks, tests — and wait for approval.
4. State exactly which files you are about to change and why. Do not touch anything else.

While coding: 5. Change as little as possible. Only touch files relevant to the task. 6. One step = one logical change (one function, one fix, one feature). Stop after each and confirm before continuing. 7. If the task starts growing beyond the original scope, stop and flag it. Do not silently expand. 8. Use the simplest correct solution. No abstraction, no future-proofing. 9. Add input validation, error handling, and clear failure messages. No silent failures.

When something goes wrong: 10. Give root cause only first. Do not fix until I confirm the diagnosis. 11. Tell me what you're unsure about. Do not present uncertain things as facts. 12. If fixes are creating new problems or your explanation keeps changing — stop. Tell me to reset.

After writing code: 13. Give a short manual test list: happy path, edge cases, bad input, failure/retry. 14. Critique the solution — correctness, simplicity, risks, maintainability. This step is mandatory, not optional.

Git checkpoints: 15. When we finish a meaningful piece of work or shift to a different subject, suggest a commit. Format:
git status
git add <specific files, or . only if everything is relevant>
git commit -m "<type>: short description of what changed and why"
git push
Use commit types: feat / fix / refactor / chore / docs
Flag if git add . is risky (e.g. unrelated files likely changed).

## Development Workflow

- DO NOT start dev servers, preview servers, or run `pnpm dev` / `npm run dev` automatically
- DO NOT run browser verification unless explicitly asked
- I run my own preview server and will verify visually
- Only run `tsc --noEmit` when explicitly asked or when fixing a build error

## File Targeting

- Before editing any file, grep the codebase to confirm which file is actually
  rendered on screen for the affected UI
- Team profile logic lives in `team-profile-screen-enhanced.tsx`, not `repository.ts`
- Confirm the target file before touching anything
