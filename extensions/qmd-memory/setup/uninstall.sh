#!/bin/bash
#
# Removes the two launchd agents setup.sh installed.
#
# It touches no data: the memory folder, the trajectory folder and qmd's own index are all
# yours, and this script has no business deleting any of them. What it removes is the automation
# — after this, nothing runs on its own, and the plugin degrades to what it does without qmd:
# recording still works, recall goes quiet.

set -uo pipefail

LAUNCH_AGENTS_DIRECTORY="${HOME}/Library/LaunchAgents"
LABELS=("com.atat.memory.qmd-server" "com.atat.memory.indexer")

note() { printf '  %s\n' "$*"; }

printf '\033[1m%s\033[0m\n\n' "qmd-memory uninstall"

for label in "${LABELS[@]}"; do
  plist="${LAUNCH_AGENTS_DIRECTORY}/${label}.plist"
  # Both spellings, both allowed to fail: "it was not loaded" is a fine outcome here.
  launchctl bootout "gui/$(id -u)/${label}" >/dev/null 2>&1
  launchctl unload -w "${plist}" >/dev/null 2>&1
  if [ -f "${plist}" ]; then
    rm -f "${plist}"
    note "removed ${plist}"
  else
    note "${label} was not installed"
  fi
done

printf '\n'
note "Nothing was deleted from your memory folders, and qmd's collections are untouched."
note "To drop those too:"
note "  qmd collection remove atat-memory"
note "  qmd collection remove atat-trajectory"
