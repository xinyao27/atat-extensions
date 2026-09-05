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
/// `store`, so the app has one stable URL for the catalog and one per archive.
const STORE_DOWNLOAD_BASE = "https://github.com/xinyao27/atat-extensions/releases/download/store";
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

const plugins = [];

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
    plugins.push({
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
        category: store.category,
        keywords: store.keywords,
        releaseNotes: store.releaseNotes,
      },
      icon,
      actions: (manifest.actions ?? []).map((action) => ({
        identifier: action.identifier,
        title: action.title,
        surfaces: action.surfaces,
      })),
      panel: manifest.panels?.[0] ? { title: manifest.panels[0].title } : null,
      readme,
      artifact: {
        fileName: archiveName,
        url: `${STORE_DOWNLOAD_BASE}/${archiveName}`,
        sha256,
        bytes,
      },
      sourceRevision,
    });
    process.stdout.write(`Packaged ${archiveName} (${sha256})\n`);
  }
  // The catalog the app's Extensions pane reads: one file, every plugin, where to get each one.
  await writeFile(
    join(ARTIFACTS, "catalog.json"),
    `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), plugins }, null, 2)}\n`
  );
} finally {
  await Promise.all(identifiers.map((identifier) => rm(join(EXTENSIONS, identifier, "main.js"), { force: true })));
}
