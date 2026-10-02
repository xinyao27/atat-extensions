# GitHub

Turns what you select or copy into a GitHub issue, or shares code as a gist.

## What it does

- **Create GitHub Issue** appears on selected text, on a Clipboard History entry and on a
  capture's recognized text. The window picks a repository (your default one first, then the
  ones you pushed to most recently), and your agent drafts a title and a one-line summary. The
  text you selected stays in the description as a quote — or in a code block when it looks
  like code — so the issue carries exactly what you saw. Add labels, change anything, then
  **Create Issue**.
- **Share as Gist** appears on selected text and Clipboard History. It names the file from
  the code's language so GitHub highlights it, and shares it as a secret gist unless you tick
  **Public**.

Either way the window ends on a link to what you created, with **Open on GitHub** and
**Copy Link**.

## What it touches

- **api.github.com** (`network`), with your personal access token (`secrets`, kept in your
  Keychain). It lists your repositories and a repository's labels, and creates issues and
  gists — nothing else. A fine-grained token needs **Issues: Read and write** on the
  repositories you want, and **Gists: Read and write** to share code.
- **Your agent** (`agent`), once per issue, to draft the title and summary. Turn **Draft with
  your agent** off and the title is the text's first line.
