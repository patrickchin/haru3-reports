#!/bin/sh
set -eu

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

current_hooks_path="$(git config --get core.hooksPath || true)"

if [ -n "$current_hooks_path" ] && [ "$current_hooks_path" != ".githooks" ]; then
  echo "Git hooks not installed: core.hooksPath is already set to '$current_hooks_path'."
  echo "Run 'git config core.hooksPath .githooks' if you want to use this repo's hooks."
  exit 0
fi

git config core.hooksPath .githooks
echo "Git hooks installed: core.hooksPath=.githooks"
