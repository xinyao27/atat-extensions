import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const EXTENSIONS = join(ROOT, "extensions");
const DIST = join(ROOT, "dist");
const ARTIFACTS = join(DIST, "artifacts");
const NORMALIZED_DATE = new Date("1980-01-01T00:00:00.000Z");
/// Where the release workflow publishes every artifact: one rolling GitHub Release, tagged
/// `extensions`, so the app has one stable URL for the catalog and one per archive.
const EXTENSIONS_DOWNLOAD_BASE = "https://github.com/xinyao27/atat-extensions/releases/download/extensions";
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

const extensions = [];

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
    const manifest = JSON.parse(await readFile(join(source, "extension.json"), "utf8"));
    const listing = JSON.parse(await readFile(join(source, "listing.json"), "utf8"));
    const packageName = identifier;
    const stagingRoot = join(DIST, "staging");
    const packageDirectory = join(stagingRoot, packageName);
    await mkdir(packageDirectory, { recursive: true });
    await writeFile(join(packageDirectory, "extension.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await copyFile(join(source, "main.js"), join(packageDirectory, "main.js"));
    for (const optional of ["icon.png", "README.md"]) {
      try { await copyFile(join(source, optional), join(packageDirectory, optional)); } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    // A service's own mark travels with the package: a PNG at the extension's root, other
    // than the two the directory itself uses — `icon.png`, the extension's own icon, and
    // `glyph.png`, the website listing's glyph, which no installed copy needs.
    const directoryOnlyAssets = new Set(["icon.png", "glyph.png"]);
    for (const item of await readdir(source, { withFileTypes: true })) {
      if (!item.isFile() || !item.name.endsWith(".png") || directoryOnlyAssets.has(item.name)) continue;
      await copyFile(join(source, item.name), join(packageDirectory, item.name));
    }
    const packageEntries = await normalizedEntries(packageDirectory);
    await utimes(packageDirectory, NORMALIZED_DATE, NORMALIZED_DATE);
    const archiveName = `${identifier}-${manifest.version}.atatextension`;
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
    let readme = null;
    try { readme = await readFile(join(source, "README.md"), "utf8"); } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    // The icon travels inside the catalog as a data URL so the app's list draws every row
    // from one request. Small by policy: 256×256 PNG is tens of kilobytes.
    let icon = null;
    try {
      const iconBytes = await readFile(join(source, "icon.png"));
      if (iconBytes.length > 128 * 1024) throw new Error(`${identifier}: icon.png exceeds 128 KB`);
      icon = `data:image/png;base64,${iconBytes.toString("base64")}`;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    // The same mark alone, black on nothing, for the website: its directory draws the
    // extension's glyph in its own icon language rather than the app's coloured tile.
    // Optional — a submission without one keeps the tile everywhere.
    let glyph = null;
    try {
      const glyphBytes = await readFile(join(source, "glyph.png"));
      if (glyphBytes.length > 128 * 1024) throw new Error(`${identifier}: glyph.png exceeds 128 KB`);
      glyph = `data:image/png;base64,${glyphBytes.toString("base64")}`;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    extensions.push({
      identifier,
      version: manifest.version,
      apiVersion: manifest.apiVersion,
      minimumAppVersion: manifest.minimumAppVersion ?? "0.10.0",
      entitlements: manifest.entitlements ?? [],
      networkHosts: manifest.networkHosts ?? [],
      hooks: (manifest.hooks ?? []).map((hook) => hook.hook),
      catalog: {
        name: manifest.name,
        description: manifest.description,
        author: manifest.author ?? null,
        category: listing.category,
        keywords: listing.keywords,
        releaseNotes: listing.releaseNotes,
      },
      icon,
      glyph,
      actions: (manifest.actions ?? []).map((action) => ({
        identifier: action.identifier,
        title: action.title,
        surfaces: action.surfaces,
      })),
      panel: manifest.panels?.[0] ? { title: manifest.panels[0].title } : null,
      readme,
      artifact: {
        fileName: archiveName,
        url: `${EXTENSIONS_DOWNLOAD_BASE}/${archiveName}`,
        sha256,
        bytes,
      },
      sourceRevision,
    });
    process.stdout.write(`Packaged ${archiveName} (${sha256})\n`);
  }
  // The catalog the app's Extensions pane reads: one file, every extension, where to get each one.
  await writeFile(
    join(ARTIFACTS, "catalog.json"),
    `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), extensions }, null, 2)}\n`
  );
} finally {
  await Promise.all(identifiers.map((identifier) => rm(join(EXTENSIONS, identifier, "main.js"), { force: true })));
}
