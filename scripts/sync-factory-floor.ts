import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(repoRoot, "packages", "factory-floor", "dist");
const targetDir = path.join(repoRoot, "public", "factory-floor");

await resetDirectory(targetDir);
await fs.copyFile(path.join(sourceDir, "factory-floor.js"), path.join(targetDir, "factory-floor.js"));
await copyDirectory(path.join(sourceDir, "assets"), path.join(targetDir, "assets"));

async function resetDirectory(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    await fs.rm(path.join(dir, entry.name), {
      recursive: entry.isDirectory()
    });
  }
}

async function copyDirectory(from: string, to: string): Promise<void> {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(source, target);
    } else if (!entry.name.endsWith(".d.ts")) {
      await fs.copyFile(source, target);
    }
  }
}
