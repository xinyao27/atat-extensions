#!/bin/bash
#
# Sets up the environment qmd-memory recalls from.
#
# Everything here belongs to the user's machine rather than to AtAt: qmd itself, two folders,
# two qmd collections, and two launchd agents that keep the index current without anyone
# watching. AtAt stays a plugin host with no background job of its own — which is the point of
# doing it this way and not inside the app.
#
# Safe to run again. Every step checks for what it would create, the agents are unloaded before
# they are replaced, and the dark-launch rule is merged rather than overwritten.
#
#   ./setup.sh                install
#   ./setup.sh --dry-run      print every step without doing any of it
#   ./setup.sh --yes          do not pause for confirmation before installing software
#   ./setup.sh --skip-flag    skip the dark-launch step at the end
#
set -uo pipefail

DRY_RUN=0
ASSUME_YES=0
SKIP_FLAG=0
for argument in "$@"; do
  case "${argument}" in
    --dry-run) DRY_RUN=1 ;;
    --yes | -y) ASSUME_YES=1 ;;
    --skip-flag) SKIP_FLAG=1 ;;
    --help | -h)
      # The header comment, which is the help text — one place to keep it correct.
      sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^#//; s/^ //'
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

# The dark-launch flag. Two switches gate the plugin system: a build-time one in the app, and
# this runtime one, which is off for everybody until an allowlist rule names an installation.
FLAGSHIP_APP_ID="4e521143-ee4f-48f2-a6bb-add04b5790a4"
FLAGSHIP_FLAG_KEY="plugin-system"
# The app's anonymous telemetry installation id, which the website passes to Flagship as the
# targeting key. It exists only once the user has allowed usage statistics.
KEYCHAIN_SERVICE="com.atat.app.telemetry"
KEYCHAIN_ACCOUNT="install-id"

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

# macOS has no `timeout(1)`. A watchdog kills the command if it outlives its budget, which is
# what keeps a credential check from sitting on a prompt forever.
run_with_timeout() {
  local seconds="$1"
  shift
  "$@" &
  local worker=$!
  (
    waited=0
    while [ "${waited}" -lt "${seconds}" ]; do
      kill -0 "${worker}" 2>/dev/null || exit 0
      sleep 1
      waited=$((waited + 1))
    done
    kill -TERM "${worker}" 2>/dev/null
  ) &
  local watchdog=$!
  wait "${worker}" 2>/dev/null
  local status=$?
  kill -TERM "${watchdog}" 2>/dev/null
  wait "${watchdog}" 2>/dev/null
  return "${status}"
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

# -------------------------------------------------------------------- dark launch

printf '\n'
bold "dark launch"

if [ "${SKIP_FLAG}" = "1" ]; then
  note "--skip-flag, so the ${FLAGSHIP_FLAG_KEY} flag is left alone."
  exit 0
fi

# `wrangler` if it is installed, `npx wrangler` otherwise.
WRANGLER=(npx --yes wrangler)
if command -v wrangler >/dev/null 2>&1; then
  WRANGLER=(wrangler)
fi

manual_instructions() {
  local identifier="$1"
  printf '\n'
  note "Run these yourself, from a machine with Cloudflare credentials:"
  printf '\n'
  printf '    npx wrangler flagship flags get %s %s\n' "${FLAGSHIP_APP_ID}" "${FLAGSHIP_FLAG_KEY}"
  printf '    npx wrangler flagship flags update %s %s \\\n' "${FLAGSHIP_APP_ID}" "${FLAGSHIP_FLAG_KEY}"
  printf '      --add-rule "serve=on; when=targetingKey in [%s]"\n' "${identifier}"
  printf '\n'
  note "--add-rule appends and keeps whatever rules are already there. Do not use --rule:"
  note "that one replaces the flag's whole rule set."
}

# The installation id, asked for rather than taken.
#
# Reading it out of the keychain works, but it makes macOS throw an authorisation dialog for a
# value the user can see and copy in AtAt's own settings — so copying is the first path and the
# keychain is the fallback, entered only when the user declines to paste. Non-interactive runs
# skip straight to the fallback, because there is nobody to paste.
UUID_PATTERN='^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'

read_pasted_id() {
  local answer
  note "In AtAt: Settings → Usage statistics → Copy installation ID."
  note "That id is the only thing Flagship can target a single device by."
  for _ in 1 2 3; do
    printf '  paste it here, or press return to read it from the keychain instead: ' >&2
    IFS= read -r answer || return 1
    # A pasted value arrives with whatever whitespace came with it.
    answer="$(printf '%s' "${answer}" | tr -d '[:space:]')"
    if [ -z "${answer}" ]; then
      return 1
    fi
    if [[ ${answer} =~ ${UUID_PATTERN} ]]; then
      printf '%s\n' "${answer}"
      return 0
    fi
    fail "  that does not look like an installation id (expected 8-4-4-4-12 hex)."
  done
  return 1
}

read_keychain_id() {
  local value
  note "Reading it from the keychain instead — macOS will ask you to authorise that once."
  value="$(security find-generic-password -s "${KEYCHAIN_SERVICE}" -a "${KEYCHAIN_ACCOUNT}" -w 2>/dev/null)"
  value="$(printf '%s' "${value}" | tr -d '[:space:]')"
  [ -n "${value}" ] || return 1
  printf '%s\n' "${value}"
}

INSTALL_ID=""
if [ "${ASSUME_YES}" != "1" ] && [ -t 0 ]; then
  INSTALL_ID="$(read_pasted_id || true)"
fi
if [ -z "${INSTALL_ID}" ]; then
  if [ "${DRY_RUN}" = "1" ]; then
    # Even the keychain read is a side effect worth not having in a dry run: it is what puts
    # the authorisation dialog on screen.
    note "dry run — not reading the keychain"
    INSTALL_ID="<your installation id>"
  else
    INSTALL_ID="$(read_keychain_id || true)"
  fi
fi

if [ -z "${INSTALL_ID}" ]; then
  note "No installation id, so there is nothing to put on the allowlist. Turn on usage"
  note "statistics in AtAt's settings, copy the id from there, and run this again."
  manual_instructions "<your installation id>"
  exit 0
fi
note "installation id: ${INSTALL_ID}"

if [ "${DRY_RUN}" = "1" ]; then
  plan "${WRANGLER[*]} flagship flags get ${FLAGSHIP_APP_ID} ${FLAGSHIP_FLAG_KEY} --json"
  note "then, depending on what that returns, one of:"
  printf '    %s flagship flags update %s %s --add-rule "serve=on; when=targetingKey in [%s]"\n' \
    "${WRANGLER[*]}" "${FLAGSHIP_APP_ID}" "${FLAGSHIP_FLAG_KEY}" "${INSTALL_ID}"
  printf '    %s flagship flags rules update %s %s --priority <n> --serve on --when "targetingKey in [<existing ids>,%s]"\n' \
    "${WRANGLER[*]}" "${FLAGSHIP_APP_ID}" "${FLAGSHIP_FLAG_KEY}" "${INSTALL_ID}"
  note "the second form is used when an allowlist rule already exists, so the ids"
  note "already on it survive."
  printf '\n'
  note "Reminder: the flag is evaluated by the website Worker. Until that is deployed,"
  note "the app reads off no matter what this flag says:"
  printf '    cd website && npx wrangler deploy\n'
  exit 0
fi

if ! run_with_timeout 15 "${WRANGLER[@]}" whoami >"${SCRATCH_DIRECTORY}/whoami" 2>&1; then
  note "no usable Cloudflare credentials here (wrangler whoami failed or timed out)."
  manual_instructions "${INSTALL_ID}"
  printf '\n'
  note "Reminder: until the website Worker is deployed the app reads off regardless:"
  printf '    cd website && npx wrangler deploy\n'
  exit 0
fi
note "Cloudflare credentials found"

if ! command -v node >/dev/null 2>&1; then
  note "node is not available to read the flag's current rules safely."
  manual_instructions "${INSTALL_ID}"
  exit 0
fi

if ! "${WRANGLER[@]}" flagship flags get "${FLAGSHIP_APP_ID}" "${FLAGSHIP_FLAG_KEY}" --json \
  >"${SCRATCH_DIRECTORY}/flag.json" 2>"${SCRATCH_DIRECTORY}/flag.err"; then
  fail "Could not read the ${FLAGSHIP_FLAG_KEY} flag:"
  sed 's/^/    /' "${SCRATCH_DIRECTORY}/flag.err" >&2
  manual_instructions "${INSTALL_ID}"
  exit 0
fi

# Decides what to do without ever throwing a rule away.
#
# `--rule` replaces the flag's whole rule set, so it is never used here. Either an allowlist
# rule already exists and one `rules update` widens it, or none does and `--add-rule` appends —
# and a rule with more conditions than a bare allowlist is left alone entirely, because
# rewriting its `when` would drop the conditions this script cannot see the intent of.
cat >"${SCRATCH_DIRECTORY}/decide.js" <<'NODE'
const { readFileSync } = require("node:fs");
const [, , path, installID] = process.argv;

let parsed;
try {
  parsed = JSON.parse(readFileSync(path, "utf8"));
} catch {
  process.stdout.write("unreadable|||");
  process.exit(0);
}

// The command may hand back the flag definition itself or an envelope around it.
const candidates = [parsed, parsed && parsed.result, parsed && parsed.flag, parsed && parsed.definition];
const definition =
  candidates.find((entry) => entry && typeof entry === "object" && Array.isArray(entry.rules)) || {};
const rules = Array.isArray(definition.rules) ? definition.rules : [];
const enabled = definition.enabled === false ? "0" : "1";

/** The ids in a bare `targetingKey in [...]` condition, or null for anything else. */
function allowlistOf(condition) {
  if (!condition || typeof condition !== "object") return null;
  if (condition.attribute !== "targetingKey" || condition.operator !== "in") return null;
  return Array.isArray(condition.value) ? condition.value.map(String) : [String(condition.value)];
}

/** Every allowlist anywhere in a condition tree, however deeply nested. */
function allAllowlists(condition, found) {
  if (!condition || typeof condition !== "object") return found;
  if (Array.isArray(condition.clauses)) {
    for (const clause of condition.clauses) allAllowlists(clause, found);
    return found;
  }
  const ids = allowlistOf(condition);
  if (ids) found.push(ids);
  return found;
}

// Already on any allowlist, nested or not: nothing to do.
for (const rule of rules) {
  for (const condition of Array.isArray(rule.conditions) ? rule.conditions : []) {
    for (const ids of allAllowlists(condition, [])) {
      if (ids.includes(installID)) {
        process.stdout.write(`armed|||${enabled}`);
        process.exit(0);
      }
    }
  }
}

// A rule that is exactly one allowlist serving `on` can be widened in place.
for (const rule of rules) {
  const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
  if (conditions.length !== 1) continue;
  if (rule.serve_variation !== "on") continue;
  const ids = allowlistOf(conditions[0]);
  if (!ids) continue;
  process.stdout.write(`merge|${rule.priority}|${ids.concat([installID]).join(",")}|${enabled}`);
  process.exit(0);
}

process.stdout.write(`append|||${enabled}`);
NODE

DECISION="$(node "${SCRATCH_DIRECTORY}/decide.js" "${SCRATCH_DIRECTORY}/flag.json" "${INSTALL_ID}")"
IFS='|' read -r ACTION PRIORITY MERGED_IDS FLAG_ENABLED <<<"${DECISION}"

if [ "${FLAG_ENABLED}" = "0" ]; then
  note "the flag is disabled, which makes every rule moot — enabling it"
  if ! "${WRANGLER[@]}" flagship flags update "${FLAGSHIP_APP_ID}" "${FLAGSHIP_FLAG_KEY}" --enable; then
    fail "Could not enable the flag."
  fi
fi

case "${ACTION}" in
  armed)
    note "this installation is already on the ${FLAGSHIP_FLAG_KEY} allowlist — nothing to do"
    ;;
  merge)
    note "widening the existing allowlist rule (priority ${PRIORITY}) instead of replacing it"
    if "${WRANGLER[@]}" flagship flags rules update "${FLAGSHIP_APP_ID}" "${FLAGSHIP_FLAG_KEY}" \
      --priority "${PRIORITY}" --serve on --when "targetingKey in [${MERGED_IDS}]"; then
      note "the allowlist now holds: ${MERGED_IDS}"
    else
      fail "Could not update rule ${PRIORITY}."
      manual_instructions "${INSTALL_ID}"
    fi
    ;;
  append)
    note "no allowlist rule yet — appending one, keeping every existing rule"
    if "${WRANGLER[@]}" flagship flags update "${FLAGSHIP_APP_ID}" "${FLAGSHIP_FLAG_KEY}" \
      --add-rule "serve=on; when=targetingKey in [${INSTALL_ID}]"; then
      note "${FLAGSHIP_FLAG_KEY} is now on for this installation"
    else
      fail "Could not append the rule."
      manual_instructions "${INSTALL_ID}"
    fi
    ;;
  *)
    note "could not make sense of the flag's current rules, so nothing was changed."
    manual_instructions "${INSTALL_ID}"
    ;;
esac

printf '\n'
note "The flag is evaluated by the website Worker, not by the app — the app asks it and"
note "caches the answer. Until that Worker is deployed, the app reads off whatever this"
note "flag says. Deploying is your call, so this script does not do it:"
printf '    cd website && npx wrangler deploy\n'
