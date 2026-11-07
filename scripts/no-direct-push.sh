#!/usr/bin/env bash
# pre-push hook: refuse a direct push to the default branch.
#
# A Free-plan private repo cannot enforce "changes reach main through a pull
# request" on the server, so the client says it. Bypass for one push with
# ALLOW_DIRECT_PUSH=1 (release tooling, first commit of a new repo).
#
# Three sources of "which refs is this push updating", strongest first:
#   1. git itself feeds one line per ref on stdin:
#        <local ref> <local sha> <remote ref> <remote sha>
#      That is complete, including every ref of a multi-ref push.
#   2. the pre-commit framework swallows that stdin and exports only the FIRST
#      pushed ref as PRE_COMMIT_REMOTE_BRANCH (e.g. refs/heads/main). So
#      `git push origin feat/x main` reaches this script looking like a push of
#      feat/x alone.
#   3. to close that gap the argv of the `git push` that started this hook is
#      read from the process ancestry and checked for the default branch (or
#      --all/--mirror/--branches). Global options before the subcommand
#      (`git -C dir push`, `git -c k=v push`) are skipped with their values, so
#      only what follows `push` is read as refs. The Windows ancestor, which
#      reports one command-line string, is split into the same tokens first.
#      Best effort: if the ancestry cannot be read, nothing is added and
#      (1)/(2) decide.
#
# Known limit: pre-commit does not run hooks at all for a push that only
# deletes refs, so `git push origin :main` never reaches this file. GitHub
# itself refuses to delete the default branch, and the agent guard
# (publish_guard) denies it, so no extra handling is attempted here.
set -u

if [ "${ALLOW_DIRECT_PUSH:-}" = "1" ]; then
  exit 0
fi

# Branches that count as "the default". With no origin/HEAD to read (a repo made
# by `git init` + `git remote add`) guessing one name would protect the wrong
# branch half the time, so both common names are protected.
default_branch="${DEFAULT_BRANCH:-}"
if [ -z "$default_branch" ]; then
  default_branch="$(git symbolic-ref --short -q refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')"
fi
if [ -n "$default_branch" ]; then
  protected="$default_branch"
else
  protected="main master"
fi

is_protected() {
  local name="$1" p
  for p in $protected; do
    [ "$name" = "$p" ] && return 0
  done
  return 1
}

block() {
  echo "ERROR: direct push to '$1' blocked. Open a pull request," >&2
  echo "       or set ALLOW_DIRECT_PUSH=1 for this one push." >&2
  exit 1
}

remote_refs=""
if [ ! -t 0 ]; then
  while read -r _local_ref _local_sha remote_ref _remote_sha; do
    remote_refs="$remote_refs $remote_ref"
  done
fi
if [ -z "${remote_refs// /}" ] && [ -n "${PRE_COMMIT_REMOTE_BRANCH:-}" ]; then
  remote_refs="$PRE_COMMIT_REMOTE_BRANCH"
fi

for remote_ref in $remote_refs; do
  name="${remote_ref#refs/heads/}"
  [ "$name" != "$remote_ref" ] && is_protected "$name" && block "$name"
done

# Fallback for a cmdline the walk below cannot parse (a wrapper such as
# `bash -c "git push ..."`): pass the line through when it contains a push as text.
substring_push() {
  local cmd
  IFS= read -r cmd || true
  case " $cmd" in
    *"git push "*|*"git-push "*|*"/git push"*) printf '%s\n' "$cmd" ;;
  esac
}

# Reduce a NUL-separated cmdline file to `git push <args after push>`, or fail when
# it is not a git push. Global options sit between `git` and `push`
# (`git -C dir push`, `git -c k=v push`), and their values (`-C main`) must not be
# read as pushed refs, so the options are walked rather than matched as text.
cmdline_push_argv() {
  local a b i=0 j n
  local -a args=()
  while IFS= read -r -d '' a; do args+=("$a"); done < "$1"
  n=${#args[@]}
  while [ "$i" -lt "$n" ]; do
    b="${args[$i]##*/}"
    b="${b##*\\}"
    case "$b" in
      git|git.exe|git-push|git-push.exe) break ;;
    esac
    i=$((i + 1))
  done
  [ "$i" -lt "$n" ] || return 1
  j=$((i + 1))
  case "$b" in
    git-push*) ;;
    *)
      local found=0
      while [ "$j" -lt "$n" ]; do
        case "${args[$j]}" in
          -c|-C|--git-dir|--work-tree|--namespace) j=$((j + 2)) ;;
          -*) j=$((j + 1)) ;;
          push) found=1; j=$((j + 1)); break ;;
          *) break ;;
        esac
      done
      [ "$found" = 1 ] || return 1
      ;;
  esac
  printf 'git push'
  while [ "$j" -lt "$n" ]; do
    printf ' %s' "${args[$j]}"
    j=$((j + 1))
  done
  printf '\n'
}

# The same two-step reduction for any NUL-separated cmdline file: walk the options,
# and when that fails fall back to the text match.
from_cmdline_file() {
  cmdline_push_argv "$1" || tr '\0' ' ' < "$1" | substring_push
}

# Windows reports an ancestor's command line as ONE string: arguments split on
# whitespace, double quotes group (and are dropped), backslashes stay literal.
# Print it as NUL-separated tokens so it goes through the same option walk as a
# /proc cmdline; otherwise the value of `-C main` would be read as a pushed ref.
winline_tokens() {
  local line="$1" ch tok="" inq=0 has=0 i
  for ((i = 0; i < ${#line}; i++)); do
    ch="${line:i:1}"
    if [ "$ch" = '"' ]; then
      inq=$((1 - inq)); has=1
    elif [ "$inq" = 0 ] && { [ "$ch" = " " ] || [ "$ch" = $'\t' ]; }; then
      if [ "$has" = 1 ]; then printf '%s\0' "$tok"; tok=""; has=0; fi
    else
      tok+="$ch"; has=1
    fi
  done
  if [ "$has" = 1 ]; then printf '%s\0' "$tok"; fi
}

# stdin: one Windows command line. stdout: `git push <args>` (see cmdline_push_argv).
winline_to_argv() {
  local line tmp
  IFS= read -r line || true
  [ -n "$line" ] || return 0
  tmp="$(mktemp 2>/dev/null)" || { printf '%s\n' "$line" | substring_push; return 0; }
  winline_tokens "$line" > "$tmp"
  from_cmdline_file "$tmp"
  rm -f "$tmp"
}

# argv of the `git push` that is running this hook, one line, space separated.
# NO_DIRECT_PUSH_ARGV, NO_DIRECT_PUSH_CMDLINE (a NUL-separated cmdline file) and
# NO_DIRECT_PUSH_WINLINE (a Windows command-line string) are test seams, checked
# in that order.
push_argv() {
  if [ -n "${NO_DIRECT_PUSH_ARGV+x}" ]; then
    printf '%s\n' "$NO_DIRECT_PUSH_ARGV"
    return
  fi
  if [ -n "${NO_DIRECT_PUSH_CMDLINE:-}" ]; then
    from_cmdline_file "$NO_DIRECT_PUSH_CMDLINE"
    return
  fi
  if [ -n "${NO_DIRECT_PUSH_WINLINE+x}" ]; then
    printf '%s\n' "$NO_DIRECT_PUSH_WINLINE" | winline_to_argv
    return
  fi
  local pid="$$" ppid cmd i
  case "$(uname -s 2>/dev/null)" in
    MINGW*|MSYS*|CYGWIN*)
      # Native git.exe is not in the MSYS process table; ask Windows for the chain.
      local winpid
      winpid="$(cat "/proc/$pid/winpid" 2>/dev/null)"
      [ -n "$winpid" ] && command -v powershell.exe >/dev/null 2>&1 || return 0
      powershell.exe -NoProfile -NonInteractive -Command "
        \$p = $winpid
        for (\$i = 0; \$i -lt 10 -and \$p; \$i++) {
          \$o = Get-CimInstance Win32_Process -Filter \"ProcessId=\$p\" -ErrorAction SilentlyContinue
          if (-not \$o) { break }
          if (\$o.CommandLine -match '(^|[\\\\/\" ])git(\\.exe)?\"?\\s+(.*\\s)?push(\\s|\$)') {
            Write-Output \$o.CommandLine; break
          }
          \$p = \$o.ParentProcessId
        }" 2>/dev/null | tr -d '\r' | winline_to_argv
      ;;
    *)
      i=0
      while [ "$i" -lt 10 ] && [ -r "/proc/$pid/stat" ]; do
        ppid="$(sed 's/.*) //' "/proc/$pid/stat" | awk '{print $2}')"
        [ -n "$ppid" ] && [ "$ppid" != "0" ] || break
        if [ -r "/proc/$ppid/cmdline" ]; then
          cmd="$(cmdline_push_argv "/proc/$ppid/cmdline" 2>/dev/null)" ||
            cmd="$(tr '\0' ' ' < "/proc/$ppid/cmdline" 2>/dev/null | substring_push)"
          [ -n "$cmd" ] && { printf '%s\n' "$cmd"; return; }
        fi
        pid="$ppid"
        i=$((i + 1))
      done
      ;;
  esac
}

argv="$(push_argv)"
if [ -n "$argv" ]; then
  current="$(git symbolic-ref --short -q HEAD 2>/dev/null)"
  for token in $argv; do
    case "$token" in
      --all|--mirror|--branches) block "(every branch, via $token)" ;;
      -*) continue ;;
    esac
    dst="${token#+}"
    case "$dst" in *:*) dst="${dst##*:}" ;; esac
    dst="${dst#refs/heads/}"
    if [ "$dst" = "HEAD" ] || [ "$dst" = "@" ]; then
      dst="$current"
    fi
    [ -n "$dst" ] && is_protected "$dst" && block "$dst"
  done
fi
exit 0
