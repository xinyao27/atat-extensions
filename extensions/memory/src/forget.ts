// Forgetting a memory: the note, the picture beside it, and the promise not to bring it back.
//
// One routine for one note and for forty of them, because the panel offers the same action in
// both places and a batch that behaves differently from the row it mirrors is a second
// feature pretending to be one.
//
// A memory that came from another assistant is on that assistant's disk as well as ours, so
// deleting the note is only half of it: without the second half the next press of “other
// assistants” would hand back the thing the user just threw away.

import { isGranted, readConfiguration } from "./library.js";
import { messageOf, type MemoryHost } from "./import/host.js";
import { forgetImported } from "./import/run.js";
import { decodeText, imageReferences, parseNote, resolveRelative } from "./notes.js";

export interface Forgotten {
  /** How many notes are gone. */
  count: number;
  /** Whether every one of them went to the Trash, which is where they can be got back from. */
  trashed: boolean;
}

/**
 * Deletes each note and whatever it points at, and answers how many are gone.
 *
 * One that has already been deleted, or that has moved, is counted out rather than raised:
 * the user asked for these to be gone, and they are.
 */
export async function forgetNotes(host: MemoryHost, paths: string[]): Promise<Forgotten> {
  const configuration = readConfiguration(host.options);
  let forgotten = 0;
  let trashed = true;
  for (const candidate of paths ?? []) {
    const path = String(candidate ?? "");
    if (!isGranted(configuration, path)) continue;

    let note: { fields: Record<string, string>; body: string } = { fields: {}, body: "" };
    try {
      note = parseNote(decodeText((await host.files.read(path)).base64));
    } catch (error) {
      // Unreadable is not a reason to keep it: the file still goes.
      host.log("could not read a note before forgetting it: " + messageOf(error));
    }

    try {
      const removed = await host.files.remove(path);
      if (removed?.trashed !== true) trashed = false;
      forgotten += 1;
    } catch (error) {
      host.log("could not delete a note: " + messageOf(error));
      continue;
    }

    for (const asset of assetsOf(configuration.memoryDirectory, path, note)) {
      if (!isGranted(configuration, asset)) continue;
      try {
        await host.files.remove(asset);
      } catch (error) {
        // The note is gone, which is what the user asked for. An image that was already
        // deleted, or that another note also points at, is not worth an error message.
        host.log("could not delete an image beside a note: " + messageOf(error));
      }
    }

    const origin = note.fields["origin"];
    if (origin && origin.length > 0) await forgetImported(host, origin, note.body);
  }
  return { count: forgotten, trashed: forgotten > 0 && trashed };
}

/** The pictures a note claims in its front matter and the ones it shows in its body. */
function assetsOf(
  memoryDirectory: string,
  notePath: string,
  note: { fields: Record<string, string>; body: string }
): string[] {
  const directory = notePath.slice(0, notePath.lastIndexOf("/"));
  const assets: string[] = [];
  const declared = note.fields["asset"];
  if (declared) {
    const path = resolveRelative(memoryDirectory, declared);
    if (path) assets.push(path);
  }
  for (const reference of imageReferences(note.body)) {
    const path = resolveRelative(directory, reference);
    if (path && assets.indexOf(path) < 0) assets.push(path);
  }
  return assets;
}
