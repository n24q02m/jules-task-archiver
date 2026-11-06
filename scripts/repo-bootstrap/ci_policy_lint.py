"""Hosted CI policy lint (spec D5-D8, R5/R6, 2026-10-24; two-file update 2026-10-30).

Policy, one sentence per rule:

- trigger: a workflow starts only from `workflow_dispatch` or `workflow_call`. Anything
  that fires by itself (`pull_request`, `push`, `schedule`, `issues`, bot-driven
  events) spends paid minutes nobody asked for. One exception: `ci.yml` of a PUBLIC
  repo may also start from `push`, `pull_request` and `merge_group` (minutes are free
  there). Every other event (`pull_request_target`, `workflow_run`, `issue_comment`,
  `issues`, `schedule`, `release`, ...) still needs a waiver, even in a public ci.yml,
  because several of them run with a write token or on untrusted input. `cd.yml` is
  dispatch-only on every repo, and an unknown visibility is treated as private.
- workflow-files: `.github/workflows` holds `ci.yml` and `cd.yml` and nothing else.
- runs-on: hosted runners from a short allow-list (the runner profiles of
  repo-bootstrap: arm for OCI deploy repos, ubuntu-latest for Cloudflare Workers repos,
  an ubuntu/windows/macos matrix for cross-platform packages). No self-hosted runner,
  no group, no label list; a `${{ matrix.x }}` runner is resolved against the job's matrix.
- timeout-minutes: every job that runs steps has one.
- concurrency: superseded runs are cancelled (`cancel-in-progress` not literally
  false), at workflow level or on every job.
- retention-days: every artifact upload keeps 3-5 days, as a literal number.

A finding can be waived on purpose by a comment on the line directly above the
offending key:

    # ci-policy: allow <rule> reason: <why this one is fine>

The reason is mandatory; a bare `allow` waives nothing. Parse failures fail closed.

Needs PyYAML (composed nodes give the line numbers a waiver is matched against).
Findings from `check_repo` are strings prefixed `FAIL`, like the other doctor gates.
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

import yaml

ALLOWED_EVENTS = frozenset({"workflow_dispatch", "workflow_call"})
# ci.yml of a public repo: the three events that only ever build the code under review.
PUBLIC_CI_EVENTS = ALLOWED_EVENTS | frozenset({"push", "pull_request", "merge_group"})
HOSTED_RUNNERS = frozenset({
    "ubuntu-24.04-arm", "ubuntu-slim", "ubuntu-latest", "windows-latest", "macos-latest",
})
WORKFLOW_FILES = frozenset({"ci.yml", "cd.yml"})
VISIBILITIES = ("public", "private")
RETENTION_MIN, RETENTION_MAX = 3, 5

_ALLOW = re.compile(r"^\s*#\s*ci-policy:\s*allow\s+([\w.-]+)\s+reason:\s*(\S.*?)\s*$")
_MATRIX_REF = re.compile(r"^\$\{\{\s*matrix\.([\w-]+)\s*\}\}$")
_UPLOAD = re.compile(r"^actions/upload(-pages)?-artifact@", re.IGNORECASE)


@dataclass(frozen=True)
class Violation:
    rule: str
    message: str
    line: int = 0


def _line(node: yaml.Node) -> int:
    return node.start_mark.line + 1


def _pairs(node: yaml.Node | None) -> list[tuple[yaml.Node, yaml.Node]]:
    return list(node.value) if isinstance(node, yaml.MappingNode) else []


def _get(node: yaml.Node | None, key: str) -> tuple[yaml.Node, yaml.Node] | None:
    for k, v in _pairs(node):
        if isinstance(k, yaml.ScalarNode) and k.value == key:
            return k, v
    return None


def _scalar(node: yaml.Node | None) -> str | None:
    return node.value if isinstance(node, yaml.ScalarNode) else None


def _waivers(text: str) -> dict[int, set[str]]:
    """line number -> rules waived for the line directly below it."""
    waived: dict[int, set[str]] = {}
    for number, raw in enumerate(text.splitlines(), start=1):
        match = _ALLOW.match(raw)
        if match:
            waived.setdefault(number + 1, set()).add(match.group(1))
    return waived


def _events(on: yaml.Node) -> list[tuple[str, int]]:
    if isinstance(on, yaml.ScalarNode):
        return [(on.value, _line(on))]
    if isinstance(on, yaml.SequenceNode):
        return [(item.value, _line(item)) for item in on.value if isinstance(item, yaml.ScalarNode)]
    return [(k.value, _line(k)) for k, _ in _pairs(on) if isinstance(k, yaml.ScalarNode)]


def _runner_labels(job: yaml.MappingNode, runs_on: yaml.Node) -> tuple[list[str], str | None]:
    """The concrete runner labels a job can land on, or why they cannot be known."""
    if isinstance(runs_on, yaml.SequenceNode):
        labels = [_scalar(i) or "<expression>" for i in runs_on.value]
        return [], f"runs-on label list {labels} (a label list selects self-hosted pools)"
    if isinstance(runs_on, yaml.MappingNode):
        return [], "runs-on group/labels mapping (selects a self-hosted pool)"
    value = _scalar(runs_on) or ""
    ref = _MATRIX_REF.match(value.strip())
    if not ref:
        if "${{" in value:
            return [], f"runs-on {value!r} cannot be resolved statically"
        return [value], None
    strategy = _get(job, "strategy")
    matrix = _get(strategy[1], "matrix") if strategy else None
    if matrix is None or not isinstance(matrix[1], yaml.MappingNode):
        return [], f"runs-on {value!r} has no literal strategy.matrix to resolve against"
    name = ref.group(1)
    labels: list[str] = []
    axis = _get(matrix[1], name)
    if axis is not None:
        if not isinstance(axis[1], yaml.SequenceNode):
            return [], f"matrix.{name} is not a literal list"
        labels += [_scalar(i) or "<expression>" for i in axis[1].value]
    include = _get(matrix[1], "include")
    if include is not None and isinstance(include[1], yaml.SequenceNode):
        for entry in include[1].value:
            hit = _get(entry, name)
            if hit is not None:
                labels.append(_scalar(hit[1]) or "<expression>")
    if not labels:
        return [], f"matrix.{name} not found; runs-on {value!r} cannot be resolved"
    return labels, None


def _cancels(node: yaml.Node | None) -> bool:
    """True when the concurrency block cancels superseded runs (not literally false)."""
    hit = _get(node, "cancel-in-progress")
    if hit is None:
        return False
    return (_scalar(hit[1]) or "").strip().lower() != "false"


def check(workflow_yaml: str, *, role: str | None = None, visibility: str | None = None) -> list[Violation]:
    """Lint one workflow. `role` is "ci" or "cd" (from the file name), `visibility` is
    "public" or "private"; only a public `ci.yml` may also start from `push`,
    `pull_request` and `merge_group`, every other combination (including an unknown one)
    gets the strict dispatch-only rule. Other events need a waiver in every case.
    """
    allowed_events = PUBLIC_CI_EVENTS if role == "ci" and visibility == "public" else ALLOWED_EVENTS
    try:
        root = yaml.compose(workflow_yaml)
    except yaml.YAMLError as exc:
        return [Violation("parse", f"not valid YAML: {str(exc).splitlines()[0]}")]
    if not isinstance(root, yaml.MappingNode):
        return [Violation("parse", "not a workflow document (top level is not a mapping)")]
    jobs = _get(root, "jobs")
    if jobs is None or not isinstance(jobs[1], yaml.MappingNode):
        return [Violation("parse", "workflow has no `jobs` mapping", _line(root))]

    found: list[Violation] = []

    def add(rule: str, message: str, line: int) -> None:
        found.append(Violation(rule, message, line))

    on = _get(root, "on")
    if on is None:
        add("trigger", "workflow declares no `on:`; it must list workflow_dispatch", _line(root))
    else:
        for event, line in _events(on[1]):
            if event not in allowed_events:
                add("trigger",
                    f"trigger {event!r} fires without a dispatch; only workflow_dispatch and workflow_call are "
                    "allowed (ci.yml of a public repo may also use push, pull_request and merge_group)",
                    line)

    workflow_concurrency = _get(root, "concurrency")
    workflow_ok = workflow_concurrency is not None and _cancels(workflow_concurrency[1])
    if workflow_concurrency is not None and not workflow_ok:
        add("concurrency", "workflow concurrency lacks `cancel-in-progress` (or sets it to false)",
            _line(workflow_concurrency[0]))

    for job_key, job in _pairs(jobs[1]):
        name = _scalar(job_key) or "<job>"
        if not isinstance(job, yaml.MappingNode) or _get(job, "uses") is not None:
            continue  # a reusable-workflow call has no runner, timeout or steps of its own
        runs_on = _get(job, "runs-on")
        if runs_on is None:
            add("runs-on", f"job {name!r} has no runs-on", _line(job_key))
        else:
            labels, problem = _runner_labels(job, runs_on[1])
            if problem:
                add("runs-on", f"job {name!r}: {problem}", _line(runs_on[0]))
            for label in labels:
                if label not in HOSTED_RUNNERS:
                    add("runs-on",
                        f"job {name!r} runs on {label!r}; allowed: {', '.join(sorted(HOSTED_RUNNERS))}",
                        _line(runs_on[0]))
        if _get(job, "timeout-minutes") is None:
            add("timeout-minutes", f"job {name!r} has no timeout-minutes", _line(job_key))
        if workflow_concurrency is None:
            local = _get(job, "concurrency")
            if local is None or not _cancels(local[1]):
                add("concurrency",
                    f"job {name!r} has no concurrency with cancel-in-progress and the workflow declares none",
                    _line(job_key))
        steps = _get(job, "steps")
        for step in (steps[1].value if steps and isinstance(steps[1], yaml.SequenceNode) else []):
            used = _get(step, "uses")
            if used is None or not _UPLOAD.match(_scalar(used[1]) or ""):
                continue
            with_ = _get(step, "with")
            days = _get(with_[1], "retention-days") if with_ else None
            if days is None:
                add("retention-days",
                    f"job {name!r}: {_scalar(used[1])} sets no retention-days (default is 90)", _line(used[0]))
                continue
            raw = (_scalar(days[1]) or "").strip()
            if not raw.isdigit():
                add("retention-days", f"job {name!r}: retention-days {raw!r} is not a literal number",
                    _line(days[0]))
            elif not RETENTION_MIN <= int(raw) <= RETENTION_MAX:
                add("retention-days",
                    f"job {name!r}: retention-days {raw} is outside {RETENTION_MIN}-{RETENTION_MAX}",
                    _line(days[0]))

    waived = _waivers(workflow_yaml)
    return [v for v in found if v.rule not in waived.get(v.line, set())]


def check_file(path: Path, label: str | None = None, visibility: str | None = None) -> list[str]:
    shown = label or str(path)
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        return [f"FAIL {shown} [parse] unreadable: {exc}"]
    role = {"ci.yml": "ci", "cd.yml": "cd"}.get(path.name)
    return [f"FAIL {shown}:{v.line} [{v.rule}] {v.message}"
            for v in check(text, role=role, visibility=visibility)]


def check_repo(repo: Path, visibility: str | None = None) -> list[str]:
    if not repo.is_dir():
        # A mistyped path must not read as "no workflows, nothing to flag".
        return [f"FAIL {str(repo).replace(chr(92), '/')}: repo path not found or not a directory"]
    workflows = repo / ".github" / "workflows"
    if not workflows.is_dir():
        return []
    findings: list[str] = []
    for path in sorted([*workflows.glob("*.yml"), *workflows.glob("*.yaml")]):
        label = str(path.relative_to(repo)).replace("\\", "/")
        if path.name not in WORKFLOW_FILES:
            findings.append(
                f"FAIL {label} [workflow-files] .github/workflows holds only "
                f"{' and '.join(sorted(WORKFLOW_FILES))}; fold this workflow into one of them"
            )
        findings += check_file(path, label, visibility)
    return findings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ci_policy_lint", description=__doc__.split("\n\n")[0])
    parser.add_argument("files", nargs="*", type=Path, help="workflow files to check")
    parser.add_argument("--repo", action="append", type=Path, default=[],
                        help="check every .github/workflows/*.y*ml of this repo (repeatable)")
    parser.add_argument("--visibility", choices=(*VISIBILITIES, "unknown"), default=None,
                        help="repo visibility; only a public repo's ci.yml may also start from push, "
                             "pull_request and merge_group (omitted or unknown means private)")
    args = parser.parse_args(argv)
    if args.visibility == "unknown":
        args.visibility = None
    if not args.files and not args.repo:
        args.repo = [Path(".")]
    findings: list[str] = []
    for repo in args.repo:
        findings += check_repo(repo, args.visibility)
    for path in args.files:
        findings += check_file(path, visibility=args.visibility)
    for finding in findings:
        print(finding)
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
