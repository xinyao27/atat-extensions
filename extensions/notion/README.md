# Notion

Adds what you select or copy to a Notion page, or saves it as a new page.

## What it does

**Save to Notion** appears on selected text, on a Clipboard History entry and on a capture's
recognized text. The window lists the pages and databases your integration can see, most
recently edited first, with a search field to narrow them:

- On a **page**, choose **Add to the end** (the text becomes paragraphs at the bottom) or
  **As a new page inside it**.
- On a **database**, the text becomes a new row, titled in the database's own title column.

A new page gets a title your agent suggests, or the text's first line. The window ends on a
link to the page, with **Open in Notion**.

## Setting it up

1. In Notion, go to **Settings › Connections › Develop or manage integrations** and create an
   internal integration. Copy its secret.
2. Paste the secret on the Notion page in @@ Settings.
3. In Notion, open each page or database you want to save into, then **••• › Connections** and
   add your integration. It only ever sees what you share with it.

## What it touches

- **api.notion.com** (`network`), with your integration secret (`secrets`, kept in your
  Keychain). It searches the pages shared with the integration, appends paragraphs to a
  page, and creates pages — it never edits or deletes what is already there.
- **Your agent** (`agent`), once per window, to suggest a title for a new page. Turn
  **Suggest a title** off and it is never asked.

## @@ Memory

The workspace also appears in **Settings › Memory** as a source you can import from. Every
page your integration can see becomes a review item — its title, its text, and a link back
to it — and you choose which are kept. Importing reads your pages only; nothing is written
back to Notion, and unimporting removes them from Memory without touching the workspace.
