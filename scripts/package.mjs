import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const EXTENSIONS = join(ROOT, "extensions");
const DIST = join(ROOT, "dist");
const ARTIFACTS = join(DIST, "artifacts");
const NORMALIZED_DATE = new Date("1980-01-01T00:00:00.000Z");
const requested = process.argv.slice(2);
const identifiers = requested.length > 0
  ? requested.map((identifier) => basename(identifier))
  : (await readdir(EXTENSIONS, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort();

const validation = spawnSync(process.execPath, [join(ROOT, "scripts/validate.mjs"), ...identifiers], { cwd: ROOT, encoding: "utf8" });
if (validation.status !== 0) throw new Error(validation.stderr || validation.stdout || "validation failed");
const build = spawnSync(process.execPath, [join(ROOT, "scripts/build.mjs"), ...identifiers], { cwd: ROOT, encoding: "utf8" });
if (build.status !== 0) throw new Error(build.stderr || build.stdout || "build failed");

await rm(DIST, { recursive: true, force: true });
await mkdir(ARTIFACTS, { recursive: true });
let sourceRevision = process.env.GITHUB_SHA;
if (!sourceRevision) {
  sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
}

const releases = [];

async function normalizedEntries(directory, prefix = "") {
  const entries = [];
  for (const item of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, item.name);
    const relative = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) {
      entries.push(`${relative}/`);
      entries.push(...await normalizedEntries(path, relative));
    } else {
      entries.push(relative);
    }
    await utimes(path, NORMALIZED_DATE, NORMALIZED_DATE);
  }
  return entries;
}

try {
  for (const identifier of identifiers) {
    const source = join(EXTENSIONS, identifier);
    const manifest = JSON.parse(await readFile(join(source, "plugin.json"), "utf8"));
    const store = JSON.parse(await readFile(join(source, "store.json"), "utf8"));
    const packageName = `${identifier}.atatplugin`;
    const stagingRoot = join(DIST, "staging");
    const packageDirectory = join(stagingRoot, packageName);
    await mkdir(packageDirectory, { recursive: true });
    await writeFile(join(packageDirectory, "plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await copyFile(join(source, "main.js"), join(packageDirectory, "main.js"));
    for (const optional of ["icon.png", "README.md"]) {
      try { await copyFile(join(source, optional), join(packageDirectory, optional)); } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    const packageEntries = await normalizedEntries(packageDirectory);
    await utimes(packageDirectory, NORMALIZED_DATE, NORMALIZED_DATE);
    const archiveName = `${identifier}-${manifest.version}.atatpluginz`;
    const archivePath = join(ARTIFACTS, archiveName);
    const entries = [`${packageName}/`, ...packageEntries.map((name) => `${packageName}/${name}`)];
    const zip = spawnSync("/usr/bin/zip", ["-X", "-q", archivePath, "-@"], {
      cwd: stagingRoot,
      input: `${entries.join("\n")}\n`,
      encoding: "utf8",
    });
    if (zip.status !== 0) throw new Error(zip.stderr || `could not package ${identifier}`);
    const bytes = (await stat(archivePath)).size;
    const sha256 = createHash("sha256").update(await readFile(archivePath)).digest("hex");
    releases.push({
      schemaVersion: 1,
      identifier,
      version: manifest.version,
      apiVersion: manifest.apiVersion,
      minimumAtAtVersion: manifest.minimumAtAtVersion ?? "0.10.0",
      entitlements: manifest.entitlements ?? [],
      networkHosts: manifest.networkHosts ?? [],
      hooks: (manifest.hooks ?? []).map((hook) => hook.hook),
      catalog: {
        name: manifest.name,
        description: manifest.description,
        author: manifest.author ?? null,
        category: store.category,
        keywords: store.keywords,
        releaseNotes: store.releaseNotes,
      },
      artifact: { fileName: archiveName, sha256, bytes },
      sourceRevision,
    });
    process.stdout.write(`Packaged ${archiveName} (${sha256})\n`);
  }
  await writeFile(join(ARTIFACTS, "release-candidates.json"), `${JSON.stringify({ schemaVersion: 1, releases }, null, 2)}\n`);
} finally {
  await Promise.all(identifiers.map((identifier) => rm(join(EXTENSIONS, identifier, "main.js"), { force: true })));
}
