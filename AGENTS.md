# AtAt extensions

The official directory of AtAt plugins: one directory per plugin under
`extensions/<identifier>/`, contributions by pull request.

Writing an AtAt plugin — a new one from a user's request, another action, hook, view or panel
on an existing one, or one that fails or gets paused inside AtAt — starts by reading
[`skills/atat-plugin/SKILL.md`](skills/atat-plugin/SKILL.md) and following its steps in order.

Every string a user sees — `plugin.json` names, descriptions and option labels, toasts,
panel text, README — reads like a person wrote it: lead with what the user gets or should
do, one short sentence, no implementation words (hook, entitlement, runtime, manifest),
English and Simplified Chinese each written natively rather than translated. The skill's
step 3 carries the rules; a string that fails them is a review finding.
