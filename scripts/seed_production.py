#!/usr/bin/env python3
"""Seed demo data to the production Supabase project via the Management API."""

import json
import urllib.request
import urllib.error
import sys

TOKEN = "sbp_2f25c6d191b139053636a3b48b40626e86053aff"
PROJECT_REF = "hsdlhvezkdydxqihiqmq"
API_URL = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
SEED_FILE = "supabase/seed.sql"


def run_query(sql: str, label: str) -> bool:
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = resp.read().decode("utf-8")
            print(f"  ✓ {label}")
            return True
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        print(f"  ✗ {label}: HTTP {e.code} — {error_body[:300]}", file=sys.stderr)
        return False
    except Exception as exc:
        print(f"  ✗ {label}: {exc}", file=sys.stderr)
        return False


def split_statements(sql: str) -> list[str]:
    """Split SQL into individual statements, preserving $$ blocks and JSON."""
    statements = []
    current = []
    in_dollar_quote = False
    i = 0
    lines = sql.splitlines(keepends=True)

    for line in lines:
        # Skip comment-only lines at statement breaks
        stripped = line.strip()
        if stripped.startswith("--") and not current:
            continue

        current.append(line)
        # Detect end of statement: semicolon at end of line (not inside JSONB)
        # We use a simple heuristic: if the line ends with ';' after stripping
        if stripped.endswith(";") and not stripped.startswith("--"):
            stmt = "".join(current).strip()
            if stmt and stmt != ";":
                statements.append(stmt)
            current = []

    # Any remaining
    leftover = "".join(current).strip()
    if leftover and leftover != ";":
        statements.append(leftover)

    return statements


def main():
    with open(SEED_FILE, encoding="utf-8") as f:
        sql = f.read()

    # Group statements into logical sections based on comments
    sections = []
    current_label = "init"
    current_stmts = []

    lines = sql.splitlines(keepends=True)
    full_sql = ""
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("-- ==="):
            # Section boundary — flush current
            if current_stmts:
                sections.append((current_label, "".join(current_stmts)))
                current_stmts = []
        elif stripped.startswith("-- ") and len(stripped) > 4 and current_stmts == []:
            current_label = stripped[3:].strip()
        current_stmts.append(line)

    if current_stmts:
        sections.append((current_label, "".join(current_stmts)))

    # Just run the whole file as one transaction using individual statement splits
    statements = split_statements(sql)
    print(f"Found {len(statements)} SQL statements to execute\n")

    success = 0
    failed = 0
    for i, stmt in enumerate(statements, 1):
        # Derive a label from first line of the statement
        first_line = stmt.splitlines()[0][:80] if stmt else f"statement {i}"
        label = f"[{i}/{len(statements)}] {first_line}"
        if run_query(stmt, label):
            success += 1
        else:
            failed += 1

    print(f"\nDone: {success} succeeded, {failed} failed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
