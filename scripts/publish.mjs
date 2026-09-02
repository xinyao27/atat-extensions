import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const ARTIFACTS = join(ROOT, "dist", "artifacts");
const identifier = process.argv[2];
if (!identifier) throw new Error("usage: node scripts/publish.mjs <identifier>");
const publicationURL = process.env.ATAT_STORE_PUBLICATION_URL;
const token = process.env.ATAT_STORE_PUBLICATION_TOKEN;
if (!publicationURL || !token) throw new Error("Store publication URL and token are required");

const candidates = JSON.parse(await readFile(join(ARTIFACTS, "release-candidates.json"), "utf8"));
const release = candidates.releases.find((candidate) => candidate.identifier === identifier);
if (!release) throw new Error(`no release candidate for ${identifier}`);
const artifact = await readFile(join(ARTIFACTS, release.artifact.fileName));
const form = new FormData();
form.set("metadata", JSON.stringify(release));
form.set("artifact", new Blob([artifact], { type: "application/zip" }), release.artifact.fileName);

const response = await fetch(publicationURL, {
  method: "POST",
  headers: { authorization: `Bearer ${token}` },
  body: form,
  redirect: "error",
});
const body = await response.text();
if (!response.ok) throw new Error(`Store publication failed (${response.status}): ${body}`);
const result = JSON.parse(body);
if (result.identifier !== release.identifier || result.version !== release.version || result.sha256 !== release.artifact.sha256) {
  throw new Error("Store publication response did not match the reviewed release candidate");
}
process.stdout.write(`Published ${result.identifier} ${result.version} (${result.sha256})\n`);
