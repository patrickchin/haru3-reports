# Merge Workflow

Default target is `dev`.

If the user asks to merge a branch like `a` or `b` into `dev`:

1. Never create a merge commit.
2. Rebase the branch onto the current `dev` tip in that branch's own worktree.
3. Merge into `dev` with `git merge --ff-only`.
4. If merging multiple branches, stack them linearly (`a` onto `dev`, `b` onto `a`, etc.) and fast-forward `dev` in order.
5. If local uncommitted changes in `dev` overlap incoming files, stop and ask.

Use:

```bash
git rebase dev
git merge --ff-only <branch>
```
