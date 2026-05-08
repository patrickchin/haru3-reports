# Merge Workflow

Default target is `dev`.

Before merging any branch into `dev`, rebase that branch onto the current
`dev` tip in the branch's own worktree.

For small commits and small changes, keep history linear:

1. Rebase the branch onto `dev`.
2. Merge into `dev` with `git merge --ff-only`.
3. If merging multiple small branches, stack them linearly (`a` onto `dev`,
   `b` onto `a`, etc.) and fast-forward `dev` in order.

For large feature branches, still rebase first, then merge through a GitHub PR
with a merge commit. This keeps the feature grouped so the whole feature can be
reverted as one unit if needed.

If local uncommitted changes in `dev` overlap incoming files, stop and ask.

Small-change command shape:

```bash
git rebase dev
git merge --ff-only <branch>
```

Large-feature command shape:

```bash
git rebase dev
gh pr merge --merge <pr-number>
```
