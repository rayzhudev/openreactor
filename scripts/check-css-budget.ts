import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const PUBLIC_DIR = path.resolve("public");
const MAX_CSS_BYTES = 40 * 1024;

async function main(): Promise<void> {
  const cssFiles = await collectCssFiles(PUBLIC_DIR);

  if (!cssFiles.length) {
    console.log("No public CSS files found.");
    return;
  }

  let failed = false;

  for (const filePath of cssFiles) {
    const size = (await stat(filePath)).size;
    const relativePath = path.relative(process.cwd(), filePath) || filePath;

    if (size > MAX_CSS_BYTES) {
      failed = true;
      console.error(
        `${relativePath}: ${formatKiB(size)} exceeds the ${formatKiB(MAX_CSS_BYTES)} CSS budget.`
      );
      continue;
    }

    console.log(`${relativePath}: ${formatKiB(size)} within the ${formatKiB(MAX_CSS_BYTES)} budget.`);
  }

  if (failed) {
    process.exitCode = 1;
  }
}

async function collectCssFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const cssFiles: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      cssFiles.push(...(await collectCssFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".css")) {
      cssFiles.push(entryPath);
    }
  }

  return cssFiles.sort();
}

function formatKiB(bytes: number): string {
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

void main();
