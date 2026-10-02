# Privacy Guard

Masks names, emails, phones and other personal details in what you send, then
puts them back in the answer you see. Detection runs on your Mac — nothing
leaves with the real values.

## What it does

Before a message goes out, Privacy Guard looks for personal details in the
prompt and in any text pills, replaces each one with a realistic stand-in, and
remembers the mapping for this turn. When the answer comes back, it swaps the
stand-ins for the real values again, so what you read is what you meant.

If the check cannot finish in time, the message is held and you can still
choose **Send anyway**.

Turn **Remember replacements** off if you do not want the same real value to
keep mapping to the same stand-in across sessions.

## What it touches

- A small detector that ships with this extension (about 4 MB). It runs on your
  Mac; nothing is sent to a server for detection.
- A short-lived map of real values to stand-ins for the current turn, and across
  sessions when Remember is on.

## Limits worth knowing

- A clean scan means "nothing obvious found", not "safe to share".
- Scope is English plus common US formats — Chinese names and national IDs are
  outside it.
- Stand-ins that happen to be common words can be restored in the wrong place.
- Every detected span is masked; there is no per-chip review yet.
