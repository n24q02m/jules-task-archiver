#!/usr/bin/env python3
"""Merge gate for repos without required status checks (GitHub Free private).

A server-side rule cannot say "only merge when CI is green" on this plan, so the
operator's tooling says it: this script reads the PR and its checks through `gh`
and refuses unless the PR is open, not a draft, mergeable and every check is
SUCCESS/SKIPPED/NEUTRAL. It replaces both the admin-bypass flag (nothing to
bypass here) and auto-merge (needs required checks).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys

_GREEN = {"SUCCESS", "SKIPPED", "NEUTRAL"}


def evaluate(pr: dict, checks: list[dict]) -> tuple[bool, str]:
    if pr.get("state") != "OPEN":
        return False, f"PR is {pr.get('state')}, not OPEN"
    if pr.get("isDraft"):
        return False, "PR is a draft"
    mergeable = pr.get("mergeable")
    if mergeable == "UNKNOWN":
        return False, "GitHub has not computed mergeability yet; retry in a few seconds"
    if mergeable != "MERGEABLE":
        return False, f"PR is {mergeable}, not MERGEABLE"
    if not checks:
        return False, "no checks reported; wait for CI before merging"
    bad = [f"{c.get('name')}: {c.get('state')}" for c in checks if c.get("state") not in _GREEN]
    if bad:
        return False, "checks not green: " + "; ".join(bad)
    return True, f"{len(checks)} check(s) green, PR mergeable"


def _gh_json(args: list[str]) -> object:
    out = subprocess.run(["gh", *args], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def _checks(number: int, repo: list[str]) -> list[dict]:
    """Read the checks; `gh pr checks` exits 1 (failed) or 8 (pending) yet still prints JSON."""
    proc = subprocess.run(
        ["gh", "pr", "checks", str(number), "--json", "name,state", *repo],
        capture_output=True, text=True,
    )
    if proc.stdout.strip().startswith("["):
        return json.loads(proc.stdout)
    if proc.returncode != 0 and "no checks reported" in proc.stderr.lower():
        return []
    raise subprocess.CalledProcessError(proc.returncode, proc.args, proc.stdout, proc.stderr)


def merge_command(number: int, repo: list[str], head_sha: str | None) -> list[str]:
    """Squash-merge command pinned to the commit whose checks were read.

    Without `--match-head-commit` a push between the check read and the merge would
    land commits that were never checked.
    """
    if not head_sha:
        raise ValueError("cannot pin the merge: the PR head commit is unknown")
    return ["gh", "pr", "merge", str(number), "--squash", "--match-head-commit", head_sha, *repo]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pr", type=int)
    parser.add_argument("--repo")
    parser.add_argument("--merge", action="store_true", help="squash-merge when the gate passes")
    args = parser.parse_args()
    repo = ["--repo", args.repo] if args.repo else []
    pr = _gh_json(["pr", "view", str(args.pr), "--json", "state,isDraft,mergeable,headRefOid", *repo])
    ok, why = evaluate(pr, _checks(args.pr, repo))
    print(("OK: " if ok else "REFUSED: ") + why)
    if ok and args.merge:
        subprocess.run(merge_command(args.pr, repo, pr.get("headRefOid")), check=True)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
