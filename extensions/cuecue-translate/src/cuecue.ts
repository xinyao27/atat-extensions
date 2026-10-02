// Talking to CueCue through its AppleScript `translate` command.
//
// One line: `tell application id "com.cuecue.app" to translate selectedText`. The app is
// found by bundle id wherever it lives and launched if it is not running, and the answer
// comes back as text. What the user selected arrives as the handler's input, so a
// selection containing quotes, a backslash, or a line that reads like shell code is text
// and nothing more — there is no shell anywhere on this path.

/// Hands the text to CueCue and returns its translation, in the engine and language
/// direction CueCue itself is set to — the same answer `⌘⇧Space` gives.
export const TRANSLATE_SCRIPT = `on atatSelection(selectedText)
  tell application id "com.cuecue.app" to return translate selectedText
end atatSelection`;
