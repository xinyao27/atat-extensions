#!/bin/bash
#
# Keeps qmd's index in step with the memory folders.
#
# Three steps, in this order and for a reason. iCloud stores a file your phone wrote as a
# placeholder until something asks for it, so `brctl download` comes first — otherwise qmd
# would index an empty stub. Then `qmd update` re-reads what changed, and `qmd embed` fills in
# the vectors for whatever `update` added.
#
# Run by launchd (see com.atat.memory.indexer.plist) and safe to run by hand:
#
#   ./memory-sync.sh ~/Memory ~/AtAt-Memory-Trajectory
#
# It is deliberately quiet on stdout and appends everything to
# ~/Library/Logs/atat-memory-sync.log instead: launchd runs it every ten minutes, and a script
# that printed would be a script whose output nobody ever reads.

set -uo pipefail

LOG_FILE="${HOME}/Library/Logs/atat-memory-sync.log"
MAXIMUM_LOG_BYTES=$((1024 * 1024))
LOCK_DIRECTORY="${TMPDIR:-/tmp}/com.atat.memory.indexer.lock"

log() {
  printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"${LOG_FILE}"
}

# Halved rather than deleted: the last few hundred kilobytes are the part worth having when
# something has gone wrong, and a rotation that threw them away would delete the evidence.
rotate_log() {
  [ -f "${LOG_FILE}" ] || return 0
  local size
  size=$(wc -c <"${LOG_FILE}" | tr -d ' ')
  if [ "${size}" -gt "${MAXIMUM_LOG_BYTES}" ]; then
    tail -c $((MAXIMUM_LOG_BYTES / 2)) "${LOG_FILE}" >"${LOG_FILE}.rotated" &&
      mv "${LOG_FILE}.rotated" "${LOG_FILE}"
    log "log truncated to the most recent $((MAXIMUM_LOG_BYTES / 2)) bytes"
  fi
}

# launchd starts a job with almost no PATH, so the binary is looked up in the places a
# JavaScript toolchain actually installs it before giving up.
find_qmd() {
  local candidate
  if candidate=$(command -v qmd 2>/dev/null); then
    printf '%s\n' "${candidate}"
    return 0
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

# One run at a time. WatchPaths and StartInterval can both fire, and two `qmd embed` processes
# on one index is not a race worth finding out about.
acquire_lock() {
  if ! mkdir "${LOCK_DIRECTORY}" 2>/dev/null; then
    log "another sync is already running; skipping this one"
    exit 0
  fi
  trap 'rmdir "${LOCK_DIRECTORY}" 2>/dev/null' EXIT
}

download_placeholders() {
  local directory="$1"
  local count=0
  local placeholder
  # NUL-delimited: a memory folder is a folder of human-named files, and some of them will
  # have spaces in them.
  while IFS= read -r -d '' placeholder; do
    brctl download "${placeholder}" >/dev/null 2>&1
    count=$((count + 1))
  done < <(find "${directory}" -type f -name '*.icloud' -print0 2>/dev/null)
  if [ "${count}" -gt 0 ]; then
    log "requested ${count} iCloud download(s) in ${directory}"
  fi
}

main() {
  mkdir -p "$(dirname "${LOG_FILE}")"
  rotate_log
  acquire_lock

  if [ "$#" -eq 0 ]; then
    log "no directories given; nothing to sync"
    exit 0
  fi

  local qmd
  if ! qmd=$(find_qmd); then
    log "qmd is not installed; skipping (install it with: npm install -g @tobilu/qmd)"
    exit 0
  fi

  local directory
  for directory in "$@"; do
    if [ -d "${directory}" ]; then
      download_placeholders "${directory}"
    else
      log "skipping ${directory}: not a directory"
    fi
  done

  local started
  started=$(date +%s)
  if "${qmd}" update >>"${LOG_FILE}" 2>&1; then
    log "qmd update finished in $(($(date +%s) - started))s"
  else
    log "qmd update failed with status $?"
    exit 0
  fi

  started=$(date +%s)
  if "${qmd}" embed >>"${LOG_FILE}" 2>&1; then
    log "qmd embed finished in $(($(date +%s) - started))s"
  else
    log "qmd embed failed with status $?"
  fi
}

main "$@"
