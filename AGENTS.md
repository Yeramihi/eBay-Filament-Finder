# Project workflow

These are standing instructions from the project owner for all future work in this repository.

- When starting a new extension version, create and switch to `work/<version>` before making changes (for example, `work/1.5`). Reuse the branch if it already exists. Follow this naming convention instead of the default `codex/` prefix.
- Always create a new version branch from the latest `origin/main`, after fetching it. Never branch a new version from the current working branch or a previous version branch. Existing version branches are resumed without resetting or rebasing their work. If the latest `main` cannot be fetched, report the issue before starting a new version branch.
- Keep every version's work on its own branch. Do not put new-version changes on an older version branch or on `main`.
- Keep the active version branch synchronised with its matching branch on `origin`. Commit and push at meaningful completed checkpoints and before ending a work session; do not leave completed work only on the local computer.
- Run checks appropriate to the changes before committing. Keep unfinished work backed up with clearly labelled checkpoint commits when needed, and report any failing checks.
- These instructions authorise routine commits and pushes to the active version branch without asking for permission again. Do not force-push, merge into `main`, or delete branches unless separately authorised.
- If a push fails or the remote is unavailable, preserve the local work and clearly report that online synchronisation is pending. Never claim synchronisation succeeded without verifying it.
- Preserve unrelated existing changes and never include credentials or other secrets in a commit.
