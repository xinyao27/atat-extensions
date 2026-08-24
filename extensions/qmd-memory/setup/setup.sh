#!/bin/bash
#
# Sets up the environment qmd-memory recalls from.
#
# Everything here belongs to the user's machine rather than to AtAt: qmd itself, two folders,
# two qmd collections, and two launchd agents that keep the index current without anyone
# watching. AtAt stays a plugin host with no background job of its own — which is the point of
# doing it this way and not inside the app.
#
# Safe to run again. Every step checks for what it would create, and the agents are unloaded
# before they are replaced.
#
#   ./setup.sh                install
#   ./setup.sh --dry-run      print every step without doing any of it
#   ./setup.sh --yes          do not pause for confirmation before installing software
#
set -uo pipefail

DRY_RUN=0
ASSUME_YES=0
for argument in "$@"; do
  case "${argument}" in
    --dry-run) DRY_RUN=1 ;;
    --yes | -y) ASSUME_YES=1 ;;
    --help | -h)
      # The header comment is the help text, so there is one place to keep it correct. Read up
      # to the first line that is not a comment rather than to a line number, which is the kind
      # of coupling that goes stale the first time the header changes length.
      awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      printf 'unknown option: %s (try --help)\n' "${argument}" >&2
      exit 64
      ;;
  esac
done

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCH_AGENTS_DIRECTORY="${HOME}/Library/LaunchAgents"
LOG_DIRECTORY="${HOME}/Library/Logs"
SERVER_LABEL="com.atat.memory.qmd-server"
INDEXER_LABEL="com.atat.memory.indexer"
MEMORY_COLLECTION="atat-memory"
TRAJECTORY_COLLECTION="atat-trajectory"

DEFAULT_MEMORY_DIRECTORY="${HOME}/Library/Mobile Documents/iCloud~is~workflow~my~workflows/Documents/memory"
DEFAULT_TRAJECTORY_DIRECTORY="${HOME}/AtAt-Memory-Trajectory"
DEFAULT_PORT="8181"

SCRATCH_DIRECTORY="$(mktemp -d)"
trap 'rm -rf "${SCRATCH_DIRECTORY}"' EXIT

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
note() { printf '  %s\n' "$*"; }
fail() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
plan() { printf '  would run: %s\n' "$*"; }

ask() {
  local prompt="$1" fallback="$2" answer
  printf '%s\n  [%s]: ' "${prompt}" "${fallback}" >&2
  IFS= read -r answer
  if [ -z "${answer}" ]; then
    printf '%s\n' "${fallback}"
  else
    # A path pasted from Finder arrives with a tilde or a trailing slash more often than not.
    answer="${answer/#\~/${HOME}}"
    printf '%s\n' "${answer%/}"
  fi
}

# Shows the exact command before running anything that installs software, and waits.
#
# `--yes` and a non-interactive stdin both skip the wait — a script being piped somewhere has
# nobody to ask — but the command is printed either way, so the log always says what ran.
confirm() {
  printf '\n'
  note "about to run:"
  printf '    %s\n' "$*"
  if [ "${ASSUME_YES}" = "1" ]; then
    note "(--yes, so not asking)"
    return 0
  fi
  if [ ! -t 0 ]; then
    note "(not a terminal, so not asking)"
    return 0
  fi
  printf '  press return to continue, or Ctrl-C to stop: ' >&2
  IFS= read -r _ || true
  return 0
}

# A folder called "Notes & Ideas" is not exotic, and neither is one with a `|` in it. Two
# separate escapes, applied in this order: XML first, because a plist cannot carry `&` or `<`
# raw, then sed, because `&` and the delimiter mean something in a replacement.
escape_for_plist() {
  printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'
}

escape_for_sed() {
  printf '%s' "$1" | sed -e 's/[|\\&]/\\&/g'
}

# ------------------------------------------------------------------------ qmd

bold "qmd-memory setup"
printf '\n'

# Every place a JavaScript toolchain puts a global binary, because a global install in one shell
# is not necessarily on the PATH of the next one.
find_qmd() {
  local candidate prefix
  if candidate="$(command -v qmd 2>/dev/null)"; then
    printf '%s\n' "${candidate}"
    return 0
  fi
  if command -v npm >/dev/null 2>&1; then
    prefix="$(npm prefix -g 2>/dev/null)"
    if [ -n "${prefix}" ] && [ -x "${prefix}/bin/qmd" ]; then
      printf '%s\n' "${prefix}/bin/qmd"
      return 0
    fi
  fi
  for candidate in \
    "${HOME}/.bun/bin/qmd" \
    "${HOME}/.local/bin/qmd" \
    "${HOME}/Library/pnpm/qmd" \
    /opt/homebrew/bin/qmd \
    /usr/local/bin/qmd; do
    if [ -x "${candidate}" ]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done
  return 1
}

# qmd loads sqlite-vec as a SQLite extension, and the SQLite macOS ships is built without
# extension support — which is why qmd's own install notes ask for Homebrew's.
ensure_sqlite() {
  if ! command -v brew >/dev/null 2>&1; then
    note "Homebrew is not installed, and qmd needs Homebrew's SQLite on macOS: the system"
    note "one is built without the extension support sqlite-vec needs. Install Homebrew"
    note "from https://brew.sh and then run 'brew install sqlite'. Without it, 'qmd doctor'"
    note "will report sqlite-vec as unavailable and vector search will not work."
    return 0
  fi
  if brew list sqlite >/dev/null 2>&1; then
    note "Homebrew's sqlite is already installed"
    return 0
  fi
  if [ "${DRY_RUN}" = "1" ]; then
    plan "brew install sqlite"
    return 0
  fi
  confirm brew install sqlite
  if ! brew install sqlite; then
    note "brew install sqlite failed — carrying on, but expect 'qmd doctor' to report"
    note "sqlite-vec as unavailable."
  fi
}

run_install() {
  if [ "${DRY_RUN}" = "1" ]; then
    plan "$*"
    return 0
  fi
  confirm "$@"
  if "$@"; then
    note "$1 finished"
  else
    fail "$* failed."
  fi
}

# bun first, then npm. bun is the installer qmd's own documentation leads with, and it writes
# into a directory the user already owns rather than into a global npm prefix they may not.
install_qmd() {
  if command -v bun >/dev/null 2>&1; then
    run_install bun install -g @tobilu/qmd
    return 0
  fi
  if command -v npm >/dev/null 2>&1; then
    run_install npm install -g @tobilu/qmd
    return 0
  fi

  note "neither bun nor npm is on this machine, so bun goes in first."
  if [ "${DRY_RUN}" = "1" ]; then
    plan "curl -fsSL https://bun.sh/install | bash"
    plan "${HOME}/.bun/bin/bun install -g @tobilu/qmd"
    return 0
  fi
  confirm 'curl -fsSL https://bun.sh/install | bash'
  if ! curl -fsSL https://bun.sh/install | bash; then
    fail "The bun installer failed."
    return 1
  fi
  # The installer puts bun somewhere this shell has never looked.
  BUN_INSTALL="${BUN_INSTALL:-${HOME}/.bun}"
  export BUN_INSTALL
  PATH="${BUN_INSTALL}/bin:${PATH}"
  export PATH
  run_install bun install -g @tobilu/qmd
}

QMD_BINARY="$(find_qmd || true)"
if [ -n "${QMD_BINARY}" ]; then
  note "found qmd at ${QMD_BINARY}"
else
  note "qmd is not installed. It is the local search engine recall talks to, and this"
  note "script can put it there."
  ensure_sqlite
  install_qmd
  QMD_BINARY="$(find_qmd || true)"
  if [ -n "${QMD_BINARY}" ]; then
    note "qmd is now at ${QMD_BINARY}"
  elif [ "${DRY_RUN}" = "1" ]; then
    QMD_BINARY="qmd"
    note "dry run — carrying on as though qmd were installed"
  else
    fail "qmd is still not on this machine."
    printf '\n'
    note "Install it by hand with one of:"
    note "  bun install -g @tobilu/qmd"
    note "  npm install -g @tobilu/qmd"
    note "and check it with 'qmd doctor'. Then run this script again."
    printf '\n'
    note "Until then the plugin still records everything it sees — install qmd later and"
    note "your whole history becomes searchable at once."
    exit 1
  fi
fi

# ------------------------------------------------------------------- the folders

printf '\n'
MEMORY_DIRECTORY="$(ask 'Memory library folder — where memories you keep on purpose live.' "${DEFAULT_MEMORY_DIRECTORY}")"
printf '\n'
note 'The trajectory folder is where AtAt writes one note per interaction. It is high'
note 'volume, so a local folder is usually the right choice. Answer "none" to skip it.'
TRAJECTORY_DIRECTORY="$(ask 'Trajectory folder' "${DEFAULT_TRAJECTORY_DIRECTORY}")"
printf '\n'
QMD_PORT="$(ask 'Port for qmd'"'"'s local server' "${DEFAULT_PORT}")"

if [ "${TRAJECTORY_DIRECTORY}" = "none" ] || [ -z "${TRAJECTORY_DIRECTORY}" ]; then
  TRAJECTORY_DIRECTORY=""
fi

printf '\n'
if ! mkdir -p "${MEMORY_DIRECTORY}/inbox" "${MEMORY_DIRECTORY}/assets" "${MEMORY_DIRECTORY}/atat"; then
  fail "Could not create ${MEMORY_DIRECTORY}."
  exit 1
fi
note "memory library: ${MEMORY_DIRECTORY}"
note '  inbox/   notes — from your phone, and from “Save to memory”'
note "  assets/  images a note points at"
note "  atat/    reserved for AtAt's own files"

if [ -n "${TRAJECTORY_DIRECTORY}" ]; then
  if ! mkdir -p "${TRAJECTORY_DIRECTORY}"; then
    fail "Could not create ${TRAJECTORY_DIRECTORY}."
    exit 1
  fi
  note "trajectory: ${TRAJECTORY_DIRECTORY}"
else
  note "trajectory: skipped — automatic recording stays off"
fi

# --------------------------------------------------------------- qmd collections

printf '\n'
bold "qmd collections"
COLLECTION_LIST=""
if [ "${DRY_RUN}" != "1" ]; then
  COLLECTION_LIST="$("${QMD_BINARY}" collection list 2>/dev/null)"
fi

add_collection() {
  local name="$1" directory="$2"
  if [ "${DRY_RUN}" = "1" ]; then
    plan "qmd collection add \"${directory}\" --name ${name} --mask '**/*.md'"
    return 0
  fi
  if printf '%s' "${COLLECTION_LIST}" | grep -qE "(^|[^a-z0-9-])${name}([^a-z0-9-]|$)"; then
    note "${name} already exists — leaving it alone"
    return 0
  fi
  if "${QMD_BINARY}" collection add "${directory}" --name "${name}" --mask '**/*.md'; then
    note "added ${name} → ${directory}"
  else
    fail "Could not add the ${name} collection. Add it by hand with:"
    fail "  qmd collection add \"${directory}\" --name ${name} --mask '**/*.md'"
  fi
}

add_collection "${MEMORY_COLLECTION}" "${MEMORY_DIRECTORY}"
if [ -n "${TRAJECTORY_DIRECTORY}" ]; then
  add_collection "${TRAJECTORY_COLLECTION}" "${TRAJECTORY_DIRECTORY}"
fi

# -------------------------------------------------------------- launchd agents

printf '\n'
bold "launchd agents"
if [ "${DRY_RUN}" = "1" ]; then
  LAUNCH_AGENTS_DIRECTORY="${SCRATCH_DIRECTORY}/LaunchAgents"
  note "dry run — rendering into ${LAUNCH_AGENTS_DIRECTORY} and loading nothing"
fi
mkdir -p "${LAUNCH_AGENTS_DIRECTORY}" "${LOG_DIRECTORY}"

# `bootout` is the modern spelling and `unload` the one that works on older systems; both are
# allowed to fail, because "it was not loaded" is the outcome this wants either way.
unload_agent() {
  local label="$1"
  [ "${DRY_RUN}" = "1" ] && return 0
  launchctl bootout "gui/$(id -u)/${label}" >/dev/null 2>&1
  launchctl unload -w "${LAUNCH_AGENTS_DIRECTORY}/${label}.plist" >/dev/null 2>&1
  return 0
}

load_agent() {
  local label="$1"
  if [ "${DRY_RUN}" = "1" ]; then
    note "would load ${label}"
    sed 's/^/    /' "${LAUNCH_AGENTS_DIRECTORY}/${label}.plist"
    return 0
  fi
  if launchctl bootstrap "gui/$(id -u)" "${LAUNCH_AGENTS_DIRECTORY}/${label}.plist" >/dev/null 2>&1; then
    note "loaded ${label}"
    return 0
  fi
  if launchctl load -w "${LAUNCH_AGENTS_DIRECTORY}/${label}.plist" >/dev/null 2>&1; then
    note "loaded ${label}"
    return 0
  fi
  fail "Could not load ${label}. Load it by hand with:"
  fail "  launchctl bootstrap gui/$(id -u) ${LAUNCH_AGENTS_DIRECTORY}/${label}.plist"
  return 1
}

# The PATH launchd will give the agents: the directory qmd lives in, plus the usual places its
# own toolchain looks.
LAUNCH_PATH="$(dirname "${QMD_BINARY}"):${HOME}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

render() {
  local template="$1" destination="$2"
  sed \
    -e "s|__QMD_BINARY__|$(escape_for_sed "$(escape_for_plist "${QMD_BINARY}")")|g" \
    -e "s|__QMD_PORT__|$(escape_for_sed "${QMD_PORT}")|g" \
    -e "s|__SYNC_SCRIPT__|$(escape_for_sed "$(escape_for_plist "${SCRIPT_DIRECTORY}/memory-sync.sh")")|g" \
    -e "s|__LAUNCH_PATH__|$(escape_for_sed "$(escape_for_plist "${LAUNCH_PATH}")")|g" \
    -e "s|__LOG_DIRECTORY__|$(escape_for_sed "$(escape_for_plist "${LOG_DIRECTORY}")")|g" \
    "${template}" >"${destination}"
}

# One `<string>` line per directory, replacing the single placeholder line. Kept as a template
# with a placeholder element rather than raw text so the template itself is a valid plist.
directory_elements() {
  local directory
  for directory in "$@"; do
    printf '\t\t<string>%s</string>\n' "$(escape_for_plist "${directory}")"
  done
}

WATCHED_DIRECTORIES=("${MEMORY_DIRECTORY}" "${MEMORY_DIRECTORY}/inbox")
SYNC_ARGUMENTS=("${MEMORY_DIRECTORY}")
if [ -n "${TRAJECTORY_DIRECTORY}" ]; then
  WATCHED_DIRECTORIES+=("${TRAJECTORY_DIRECTORY}")
  SYNC_ARGUMENTS+=("${TRAJECTORY_DIRECTORY}")
fi

unload_agent "${SERVER_LABEL}"
unload_agent "${INDEXER_LABEL}"

render \
  "${SCRIPT_DIRECTORY}/${SERVER_LABEL}.plist" \
  "${LAUNCH_AGENTS_DIRECTORY}/${SERVER_LABEL}.plist"

render \
  "${SCRIPT_DIRECTORY}/${INDEXER_LABEL}.plist" \
  "${LAUNCH_AGENTS_DIRECTORY}/${INDEXER_LABEL}.plist"

# The two multi-line substitutions: one placeholder line becomes one `<string>` per directory.
#
# The replacement travels through a file rather than through `awk -v`, which cannot carry a
# newline in a variable, and rather than through `sed`, which cannot portably insert one.
substitute_lines() {
  local file="$1" placeholder="$2" replacement_file="$3"
  awk -v placeholder="${placeholder}" -v replacement="${replacement_file}" '
    index($0, placeholder) > 0 {
      while ((getline line < replacement) > 0) print line
      close(replacement)
      next
    }
    { print }
  ' "${file}" >"${file}.rendered" && mv "${file}.rendered" "${file}"
}

directory_elements "${SYNC_ARGUMENTS[@]}" >"${SCRATCH_DIRECTORY}/arguments"
directory_elements "${WATCHED_DIRECTORIES[@]}" >"${SCRATCH_DIRECTORY}/watched"

substitute_lines \
  "${LAUNCH_AGENTS_DIRECTORY}/${INDEXER_LABEL}.plist" \
  "__MEMORY_DIRECTORIES__" \
  "${SCRATCH_DIRECTORY}/arguments"

substitute_lines \
  "${LAUNCH_AGENTS_DIRECTORY}/${INDEXER_LABEL}.plist" \
  "__WATCH_PATHS__" \
  "${SCRATCH_DIRECTORY}/watched"

for label in "${SERVER_LABEL}" "${INDEXER_LABEL}"; do
  if ! plutil -lint "${LAUNCH_AGENTS_DIRECTORY}/${label}.plist" >/dev/null; then
    fail "The rendered ${label}.plist is not valid. Nothing was loaded."
    exit 1
  fi
done

chmod +x "${SCRIPT_DIRECTORY}/memory-sync.sh" 2>/dev/null
load_agent "${SERVER_LABEL}"
load_agent "${INDEXER_LABEL}"

# ------------------------------------------------------------------- first index

printf '\n'
bold "first index"
if [ "${DRY_RUN}" = "1" ]; then
  plan "memory-sync.sh ${SYNC_ARGUMENTS[*]}"
  plan "qmd status"
  plan "curl http://127.0.0.1:${QMD_PORT}/health"
else
  note "downloading iCloud placeholders, then qmd update and qmd embed."
  note "this can take a while the first time — qmd downloads its models."
  PATH="${LAUNCH_PATH}" bash "${SCRIPT_DIRECTORY}/memory-sync.sh" "${SYNC_ARGUMENTS[@]}"
  note "log: ${LOG_DIRECTORY}/atat-memory-sync.log"

  printf '\n'
  bold "qmd status"
  "${QMD_BINARY}" status 2>&1 | sed 's/^/  /'

  printf '\n'
  if curl -fsS --max-time 3 "http://127.0.0.1:${QMD_PORT}/health" >/dev/null 2>&1; then
    note "the search server answers on port ${QMD_PORT}"
  else
    note "the search server is not answering on port ${QMD_PORT} yet — it may still be starting."
    note "check ${LOG_DIRECTORY}/atat-qmd-server.log if recall stays empty."
  fi
fi

printf '\n'
bold "One step left, in AtAt"
note "Settings → Plugins → qmd-memory, and grant the two folders:"
note "  Memory library folder   ${MEMORY_DIRECTORY}"
if [ -n "${TRAJECTORY_DIRECTORY}" ]; then
  note "  Trajectory folder       ${TRAJECTORY_DIRECTORY}"
fi
note "  qmd port                ${QMD_PORT}"
printf '\n'
note "A folder grant has to come from your own hand in that panel — no script can give"
note "a plugin access to a directory, which is the point."
