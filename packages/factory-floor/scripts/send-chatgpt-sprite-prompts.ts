#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

type SpriteSpec = {
  index: number;
  name: string;
  filename: string;
  size: string;
  prompt: string;
};

type Options = {
  all: boolean;
  auto: boolean;
  capture: boolean;
  captureLatest: boolean;
  dryRun: boolean;
  keepBackground: boolean;
  list: boolean;
  noNewChat: boolean;
  noSubmit: boolean;
  outPath?: string;
  pollMs: number;
  postprocessPath?: string;
  selection?: string;
  timeoutMs: number;
};

type ImageButton = {
  height: number;
  index: number;
  windowIndex: number;
  windowName: string;
  width: number;
  x: number;
  y: number;
};

type ChatGPTElementReference = {
  height: number;
  index: number;
  width: number;
  windowIndex: number;
  windowName: string;
  x: number;
  y: number;
};

type ChatGPTState = {
  composerIndex: number | null;
  imageButtons: ImageButton[];
  imageMarkers: ChatGPTElementReference[];
  imageCreatedCount: number;
  pngFilename: string | null;
  previewButton: ChatGPTElementReference | null;
  sendButtonIndex: number | null;
};

type PreviewState = {
  documentCount: number;
  frontDocumentName: string | null;
  hasSheet: boolean;
};

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spritesDocPath = path.join(packageRoot, "SPRITES.md");

function parseArgs(argv: string[]): Options {
  const options: Options = {
    all: false,
    auto: false,
    capture: false,
    captureLatest: false,
    dryRun: false,
    keepBackground: false,
    list: false,
    noNewChat: false,
    noSubmit: false,
    pollMs: 1000,
    timeoutMs: 180000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--all") {
      options.all = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--auto") {
      options.auto = true;
      continue;
    }

    if (arg === "--capture") {
      options.capture = true;
      continue;
    }

    if (arg === "--capture-latest") {
      options.captureLatest = true;
      continue;
    }

    if (arg === "--list") {
      options.list = true;
      continue;
    }

    if (arg === "--keep-background") {
      options.keepBackground = true;
      continue;
    }

    if (arg === "--no-new-chat") {
      options.noNewChat = true;
      continue;
    }

    if (arg === "--no-submit") {
      options.noSubmit = true;
      continue;
    }

    if (arg === "--sprite") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--sprite requires a value.");
      }
      options.selection = value;
      index += 1;
      continue;
    }

    if (arg === "--out") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--out requires a value.");
      }
      options.outPath = value;
      index += 1;
      continue;
    }

    if (arg === "--postprocess") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--postprocess requires a file path.");
      }
      options.postprocessPath = value;
      index += 1;
      continue;
    }

    if (arg === "--poll-ms") {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("--poll-ms requires a positive number.");
      }
      options.pollMs = value;
      index += 1;
      continue;
    }

    if (arg === "--timeout-ms") {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("--timeout-ms requires a positive number.");
      }
      options.timeoutMs = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function parseSpriteSpecs(markdown: string): SpriteSpec[] {
  const inventoryByFilename = new Map<string, string>();
  const inventoryPattern =
    /^\|\s*(\d+)\s*\|\s*[^|]+\|\s*(.*?)\s*\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|$/gm;

  for (const match of markdown.matchAll(inventoryPattern)) {
    inventoryByFilename.set(match[3].trim(), match[4].trim());
  }

  const sectionPattern =
    /^##\s+(\d+)\.\s+([^\n]+)\n\nFilename:\s*`([^`]+)`\n\n```text\n([\s\S]*?)```/gm;
  const sprites: SpriteSpec[] = [];

  for (const match of markdown.matchAll(sectionPattern)) {
    sprites.push({
      index: Number(match[1]),
      name: match[2].trim(),
      filename: match[3].trim(),
      size: inventoryByFilename.get(match[3].trim()) ?? "n/a",
      prompt: match[4].trim(),
    });
  }

  return sprites.sort((left, right) => left.index - right.index);
}

function printUsage(): void {
  console.log(`Usage:
  bun run sprites:chatgpt --list
  bun run sprites:chatgpt --sprite 1
  bun run sprites:chatgpt --sprite drone-base-neutral.png --capture
  bun run sprites:chatgpt --capture-latest --out ./src/assets/sprites/drone-base-neutral.png
  bun run sprites:chatgpt --postprocess ./src/assets/sprites/station-intake.png
  bun run sprites:chatgpt --all --capture --auto

Options:
  --list         List available sprite prompts
  --sprite       Select one sprite by number, filename, or name fragment
  --all          Step through all sprite prompts
  --auto         Do not pause between sprites
  --capture      Wait for a generated image and download the real PNG via Preview
  --capture-latest Download the currently visible latest generated image
  --dry-run      Print prompts without opening ChatGPT
  --keep-background Skip automatic white-background removal after download
  --no-submit    Paste the prompt without pressing Return
  --no-new-chat  Reuse the current chat instead of sending Cmd-N first
  --out          Output path for the downloaded image
  --postprocess  Remove plain white background from an existing PNG in place
  --poll-ms      Poll interval when waiting for image generation
  --timeout-ms   Timeout when waiting for image generation`);
}

function selectSprites(sprites: SpriteSpec[], options: Options): SpriteSpec[] {
  if (options.all) {
    return sprites;
  }

  if (!options.selection) {
    return [];
  }

  const selection = normalize(options.selection);
  const indexSelection = Number(selection);

  return sprites.filter((sprite) => {
    if (!Number.isNaN(indexSelection) && sprite.index === indexSelection) {
      return true;
    }

    if (normalize(sprite.filename) === selection) {
      return true;
    }

    return normalize(sprite.name).includes(selection);
  });
}

function run(command: string, args: string[], stdinText?: string): void {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    input: stdinText,
  });

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(
      `${command} ${args.join(" ")} failed with code ${result.status}${stderr ? `\n${stderr}` : ""}`,
    );
  }
}

function runAndCapture(command: string, args: string[], stdinText?: string): string {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    input: stdinText,
  });

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(
      `${command} ${args.join(" ")} failed with code ${result.status}${stderr ? `\n${stderr}` : ""}`,
    );
  }

  return result.stdout.trim();
}

function commandExists(command: string, args: string[] = ["-version"]): boolean {
  const result = spawnSync(command, args, {
    encoding: "utf8",
  });

  if (result.error && "code" in result.error && result.error.code === "ENOENT") {
    return false;
  }

  return result.status === 0;
}

function runJavaScriptAutomation(script: string): string {
  const tempDir = mkdtempSync(path.join(tmpdir(), "chatgpt-app-"));
  const scriptPath = path.join(tempDir, "automation.js");
  writeFileSync(scriptPath, script, "utf8");

  try {
    const result = spawnSync("osascript", ["-l", "JavaScript", scriptPath], {
      encoding: "utf8",
    });

    if (result.status !== 0) {
      const stderr = result.stderr.trim();
      throw new Error(
        `osascript -l JavaScript ${scriptPath} failed with code ${result.status}${stderr ? `\n${stderr}` : ""}`,
      );
    }

    return `${result.stdout}${result.stderr}`.trim();
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

function jsonForJavaScript(value: unknown): string {
  return JSON.stringify(JSON.stringify(value));
}

function appleScriptString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function runAppleScriptCommand(lines: string[]): void {
  const args = lines.flatMap((line) => ["-e", line]);
  run("osascript", args);
}

function runAppleScriptCapture(lines: string[]): string {
  const args = lines.flatMap((line) => ["-e", line]);
  return runAndCapture("osascript", args);
}

function getChatGPTState(): ChatGPTState {
  const script = `
const se = Application('System Events');
const proc = se.processes.byName('ChatGPT');
const result = {
  composerIndex: null,
  imageButtons: [],
  imageMarkers: [],
  imageCreatedCount: 0,
  pngFilename: null,
  previewButton: null,
  sendButtonIndex: null,
};

function safe(getter, fallback) {
  try {
    return getter();
  } catch (error) {
    return fallback;
  }
}

try {
  const windows = safe(() => proc.windows(), []);
  for (let windowIndex = 0; windowIndex < windows.length; windowIndex += 1) {
    const win = windows[windowIndex];
    const windowName = safe(() => win.name(), '');
    const all = safe(() => win.entireContents(), []);
    const isQuickLookWindow = windowName === 'Quick Look';

    for (let index = 0; index < all.length; index += 1) {
      const element = all[index];
      const role = safe(() => element.role(), '');
      const title = safe(() => element.title(), '');
      const description = safe(() => element.description(), '');
      const help = safe(() => element.help(), '');
      const value = safe(() => element.value(), '');
      const position = safe(() => element.position(), null);
      const size = safe(() => element.size(), null);

      if (
        !isQuickLookWindow &&
        result.composerIndex === null &&
        role === 'AXTextArea' &&
        description === 'text entry area'
      ) {
        result.composerIndex = index;
      }

      if (
        !isQuickLookWindow &&
        result.sendButtonIndex === null &&
        role === 'AXButton' &&
        typeof help === 'string' &&
        help.startsWith('Send message')
      ) {
        result.sendButtonIndex = index;
      }

      if (
        !isQuickLookWindow &&
        role === 'AXStaticText' &&
        ((typeof value === 'string' && value === 'Image created') ||
          description === 'text' && value === 'Image created')
      ) {
        result.imageCreatedCount += 1;
        if (Array.isArray(position) && Array.isArray(size)) {
          result.imageMarkers.push({
            height: size[1],
            index,
            width: size[0],
            windowIndex,
            windowName,
            x: position[0],
            y: position[1],
          });
        }
      }

      if (
        result.previewButton === null &&
        role === 'AXButton' &&
        title === 'Open with Preview' &&
        Array.isArray(position) &&
        Array.isArray(size)
      ) {
        result.previewButton = {
          height: size[1],
          index,
          width: size[0],
          windowIndex,
          windowName,
          x: position[0],
          y: position[1],
        };
      }

      if (
        result.pngFilename === null &&
        role === 'AXStaticText' &&
        typeof value === 'string' &&
        value.endsWith('.png')
      ) {
        result.pngFilename = value;
      }

      if (
        !isQuickLookWindow &&
        role === 'AXButton' &&
        Array.isArray(position) &&
        Array.isArray(size) &&
        size[0] >= 200 &&
        size[1] >= 200
      ) {
        result.imageButtons.push({
          height: size[1],
          index,
          windowIndex,
          windowName,
          width: size[0],
          x: position[0],
          y: position[1],
        });
      }
    }
  }
} catch (error) {}

result.imageButtons.sort((left, right) => {
  if (left.y !== right.y) {
    return left.y - right.y;
  }
  return left.x - right.x;
});

result.imageMarkers.sort((left, right) => {
  if (left.y !== right.y) {
    return left.y - right.y;
  }
  return left.x - right.x;
});

console.log(JSON.stringify(result));
`;

  let lastOutput = "";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    lastOutput = runJavaScriptAutomation(script);
    if (lastOutput) {
      return JSON.parse(lastOutput) as ChatGPTState;
    }
    run("sleep", ["0.5"]);
  }

  throw new Error("ChatGPT state probe returned no data.");
}

function getPreviewState(): PreviewState {
  const script = `
const preview = Application('Preview');
const se = Application('System Events');
const result = {
  documentCount: 0,
  frontDocumentName: null,
  hasSheet: false,
};

function safe(getter, fallback) {
  try {
    return getter();
  } catch (error) {
    return fallback;
  }
}

try {
  result.documentCount = safe(() => preview.documents.length, 0);
  if (result.documentCount > 0) {
    result.frontDocumentName = safe(() => preview.documents[0].name(), null);
  }

  const proc = se.processes.byName('Preview');
  const windows = safe(() => proc.windows(), []);
  for (let index = 0; index < windows.length; index += 1) {
    const win = windows[index];
    if (safe(() => win.sheets.length > 0, false)) {
      result.hasSheet = true;
      break;
    }
  }
} catch (error) {}

console.log(JSON.stringify(result));
`;

  const output = runJavaScriptAutomation(script);
  if (!output) {
    return {
      documentCount: 0,
      frontDocumentName: null,
      hasSheet: false,
    };
  }

  return JSON.parse(output) as PreviewState;
}

function pressLatestChatGPTImage(): void {
  const script = `
const se = Application('System Events');
const proc = se.processes.byName('ChatGPT');
const chatgpt = Application('ChatGPT');
chatgpt.activate();
delay(0.2);

function safe(getter, fallback) {
  try {
    return getter();
  } catch (error) {
    return fallback;
  }
}

const windows = safe(() => proc.windows(), []);
const imageButtons = [];

for (let windowIndex = 0; windowIndex < windows.length; windowIndex += 1) {
  const win = windows[windowIndex];
  if (safe(() => win.name(), '') === 'Quick Look') {
    continue;
  }

  const all = safe(() => win.entireContents(), []);
  for (let index = 0; index < all.length; index += 1) {
    const element = all[index];
    const role = safe(() => element.role(), '');
    const position = safe(() => element.position(), null);
    const size = safe(() => element.size(), null);
    if (
      role === 'AXButton' &&
      Array.isArray(position) &&
      Array.isArray(size) &&
      size[0] >= 200 &&
      size[1] >= 200
    ) {
      imageButtons.push({ element, x: position[0], y: position[1] });
    }
  }
}

imageButtons.sort((left, right) => {
  if (left.y !== right.y) {
    return left.y - right.y;
  }
  return left.x - right.x;
});

const latestImage = imageButtons[imageButtons.length - 1];
if (!latestImage) {
  throw new Error('No generated image is currently visible in ChatGPT.');
}

latestImage.element.actions.byName('AXPress').perform();
`;

  runJavaScriptAutomation(script);
}

function pressChatGPTPreviewButton(): void {
  const boundsOutput = runAppleScriptCapture([
    'tell application "System Events" to tell process "ChatGPT" to get position of window "Quick Look" & size of window "Quick Look"',
  ]);
  const numbers = boundsOutput
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));

  if (numbers.length !== 4) {
    throw new Error(
      `Could not determine ChatGPT Quick Look bounds from: ${boundsOutput}`,
    );
  }

  const [x, y, width] = numbers;
  const clickX = Math.round(x + width - 54);
  const clickY = Math.round(y + 19);
  const script = `
import CoreGraphics

let point = CGPoint(x: ${clickX}, y: ${clickY})

func post(_ type: CGEventType) {
  guard let event = CGEvent(
    mouseEventSource: nil,
    mouseType: type,
    mouseCursorPosition: point,
    mouseButton: .left
  ) else {
    return
  }
  event.post(tap: .cghidEventTap)
}

post(.leftMouseDown)
post(.leftMouseUp)
`;

  runAppleScriptCommand(['tell application "ChatGPT" to activate']);
  run("sleep", ["0.2"]);
  run("swift", ["-e", script]);
}

function sendPromptToChatGPT(prompt: string, options: Options): void {
  const script = `
const promptText = JSON.parse(${jsonForJavaScript(prompt)});
const createNewChat = ${options.noNewChat ? "false" : "true"};
const shouldSubmit = ${options.noSubmit ? "false" : "true"};
const se = Application('System Events');
const chatgpt = Application('ChatGPT');
chatgpt.activate();
delay(0.8);

if (createNewChat) {
  se.keystroke('n', { using: 'command down' });
  delay(0.8);
}

function safe(getter, fallback) {
  try {
    return getter();
  } catch (error) {
    return fallback;
  }
}

function getIndexes() {
  const proc = se.processes.byName('ChatGPT');
  const windows = proc.windows();
  let win = null;
  for (let index = 0; index < windows.length; index += 1) {
    const candidate = windows[index];
    if (safe(() => candidate.name(), '') !== 'Quick Look') {
      win = candidate;
      break;
    }
  }
  if (win === null && windows.length > 0) {
    win = windows[0];
  }
  if (win === null) {
    return { all: [], composerIndex: null, sendButtonIndex: null };
  }
  const all = win.entireContents();
  let composerIndex = null;
  let sendButtonIndex = null;

  for (let index = 0; index < all.length; index += 1) {
    const element = all[index];
    const role = safe(() => element.role(), '');
    const description = safe(() => element.description(), '');
    const help = safe(() => element.help(), '');

    if (composerIndex === null && role === 'AXTextArea' && description === 'text entry area') {
      composerIndex = index;
    }

    if (
      sendButtonIndex === null &&
      role === 'AXButton' &&
      typeof help === 'string' &&
      help.startsWith('Send message')
    ) {
      sendButtonIndex = index;
    }
  }

  return { all, composerIndex, sendButtonIndex };
}

let indexes = null;
for (let attempt = 0; attempt < 50; attempt += 1) {
  indexes = getIndexes();
  if (indexes.composerIndex !== null && indexes.sendButtonIndex !== null) {
    break;
  }
  delay(0.2);
}

if (!indexes || indexes.composerIndex === null || indexes.sendButtonIndex === null) {
  throw new Error('ChatGPT composer or send button not available.');
}

indexes.all[indexes.composerIndex].value = promptText;
delay(0.2);

if (shouldSubmit) {
  indexes = getIndexes();
  indexes.all[indexes.sendButtonIndex].actions.byName('AXPress').perform();
}
`;

  runJavaScriptAutomation(script);
}

function waitForNewImage(
  baselineState: ChatGPTState,
  timeoutMs: number,
  pollMs: number,
): ChatGPTState {
  const baselineLatestImageSignature = getLatestElementSignature(
    baselineState.imageButtons,
  );
  const baselineLatestMarkerSignature = getLatestElementSignature(
    baselineState.imageMarkers,
  );
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = getChatGPTState();
    const hasNewImageButton =
      state.imageButtons.length > baselineState.imageButtons.length;
    const hasNewImageMarker =
      state.imageCreatedCount > baselineState.imageCreatedCount;
    const hasDifferentLatestImage =
      getLatestElementSignature(state.imageButtons) !==
      baselineLatestImageSignature;
    const hasDifferentLatestMarker =
      getLatestElementSignature(state.imageMarkers) !==
      baselineLatestMarkerSignature;

    if (
      hasNewImageButton ||
      hasNewImageMarker ||
      hasDifferentLatestImage ||
      hasDifferentLatestMarker
    ) {
      return state;
    }

    run("sleep", [String(Math.max(pollMs, 50) / 1000)]);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for ChatGPT image generation.`,
  );
}

function getLatestElementSignature(
  elements: ChatGPTElementReference[],
): string | null {
  const latest = elements.at(-1);
  if (!latest) {
    return null;
  }

  return [
    latest.windowIndex,
    latest.windowName,
    latest.x,
    latest.y,
    latest.width,
    latest.height,
  ].join(":");
}

function waitForChatGPTImageViewer(
  timeoutMs: number,
  pollMs: number,
): ChatGPTState {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = getChatGPTState();
    const chatGPTWindowNames = runAppleScriptCapture([
      'tell application "System Events" to tell process "ChatGPT" to get name of every window',
    ]);
    const hasQuickLookWindow = chatGPTWindowNames.includes("Quick Look");

    if (state.previewButton !== null || hasQuickLookWindow) {
      return state;
    }
    run("sleep", [String(Math.max(pollMs, 50) / 1000)]);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for the ChatGPT image viewer.`,
  );
}

function dismissChatGPTQuickLookIfOpen(): void {
  const script = `
const se = Application('System Events');
const proc = se.processes.byName('ChatGPT');
const chatgpt = Application('ChatGPT');

function safe(getter, fallback) {
  try {
    return getter();
  } catch (error) {
    return fallback;
  }
}

const windows = safe(() => proc.windows(), []);
let hasQuickLook = false;
for (let index = 0; index < windows.length; index += 1) {
  if (safe(() => windows[index].name(), '') === 'Quick Look') {
    hasQuickLook = true;
    break;
  }
}

if (hasQuickLook) {
  chatgpt.activate();
  delay(0.2);
  se.keyCode(53);
}
`;

  runJavaScriptAutomation(script);
}

function openLatestChatGPTImageInViewer(
  timeoutMs: number,
  pollMs: number,
): ChatGPTState {
  dismissChatGPTQuickLookIfOpen();
  run("sleep", ["0.3"]);

  const state = getChatGPTState();
  const chatGPTWindowNames = runAppleScriptCapture([
    'tell application "System Events" to tell process "ChatGPT" to get name of every window',
  ]);
  if (state.previewButton !== null || chatGPTWindowNames.includes("Quick Look")) {
    return state;
  }

  const latestImage = state.imageButtons.at(-1);
  if (!latestImage) {
    throw new Error("No generated image is currently visible in ChatGPT.");
  }

  pressLatestChatGPTImage();
  return waitForChatGPTImageViewer(timeoutMs, pollMs);
}

function waitForPreviewDocument(
  expectedName: string | null,
  baselineCount: number,
  timeoutMs: number,
  pollMs: number,
): PreviewState {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = getPreviewState();
    const hasNewDocument = state.documentCount > baselineCount;
    const hasExpectedFrontDocument =
      expectedName !== null && state.frontDocumentName === expectedName;

    if (hasNewDocument || hasExpectedFrontDocument) {
      return state;
    }

    run("sleep", [String(Math.max(pollMs, 50) / 1000)]);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for Preview to open the image.`,
  );
}

function openLatestChatGPTImageInPreview(
  timeoutMs: number,
  pollMs: number,
): string | null {
  const baselinePreview = getPreviewState();
  const viewerState = openLatestChatGPTImageInViewer(timeoutMs, pollMs);

  pressChatGPTPreviewButton();
  const previewState = waitForPreviewDocument(
    viewerState.pngFilename,
    baselinePreview.documentCount,
    timeoutMs,
    pollMs,
  );
  return viewerState.pngFilename ?? previewState.frontDocumentName;
}

function dismissPreviewBlockingSheet(): void {
  runAppleScriptCommand([
    'tell application "Preview" to activate',
    'tell application "System Events" to tell process "Preview" to if exists sheet 1 of window 1 then if exists button "OK" of sheet 1 of window 1 then click button "OK" of sheet 1 of window 1',
  ]);
}

function waitForPreviewSaveSheet(timeoutMs: number, pollMs: number): void {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = getPreviewState();
    if (state.hasSheet) {
      return;
    }
    run("sleep", [String(Math.max(pollMs, 50) / 1000)]);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for Preview Save As dialog.`,
  );
}

function openPreviewSaveAsDialog(timeoutMs: number, pollMs: number): void {
  dismissPreviewBlockingSheet();
  try {
    runAppleScriptCommand([
      'tell application "Preview" to activate',
      "delay 0.2",
      'tell application "System Events" to tell process "Preview" to click menu item "Save As…" of menu 1 of menu bar item "File" of menu bar 1',
    ]);
  } catch {
    runAppleScriptCommand([
      'tell application "Preview" to activate',
      "delay 0.2",
      'tell application "System Events" to keystroke "S" using {command down, shift down}',
    ]);
  }
  waitForPreviewSaveSheet(timeoutMs, pollMs);
}

function focusPreviewDocument(documentName: string): void {
  runAppleScriptCommand([
    'tell application "Preview" to activate',
    `tell application "System Events" to tell process "Preview" to perform action "AXRaise" of window ${appleScriptString(documentName)}`,
  ]);
}

function saveFrontPreviewDocumentToDownloads(
  outputPath: string,
  timeoutMs: number,
  pollMs: number,
): string {
  const outputName = path.basename(outputPath, path.extname(outputPath));
  const tempName = `${outputName}-${Date.now()}`;
  const stagedPath = path.join(process.env.HOME ?? "", "Downloads", `${tempName}.png`);

  if (existsSync(stagedPath)) {
    unlinkSync(stagedPath);
  }

  openPreviewSaveAsDialog(timeoutMs, pollMs);
  runAppleScriptCommand([
    `tell application "System Events" to tell process "Preview" to tell splitter group 1 of sheet 1 of window 1 to set value of text field "Save As:" to ${appleScriptString(tempName)}`,
    'tell application "System Events" to tell process "Preview" to click button "Save" of splitter group 1 of sheet 1 of window 1',
  ]);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(stagedPath)) {
      mkdirSync(path.dirname(outputPath), { recursive: true });
      copyFileSync(stagedPath, outputPath);
      unlinkSync(stagedPath);
      return outputPath;
    }
    run("sleep", [String(Math.max(pollMs, 50) / 1000)]);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for Preview to save ${stagedPath}.`,
  );
}

function removePlainWhiteBackgroundFromPng(outputPath: string): void {
  if (!commandExists("magick")) {
    console.warn(
      "Skipping background cleanup because ImageMagick (`magick`) is not installed.",
    );
    return;
  }

  const identifyOutput = runAndCapture("magick", [
    "identify",
    "-format",
    "%w %h",
    outputPath,
  ]);
  const [widthText, heightText] = identifyOutput.split(" ");
  const width = Number(widthText);
  const height = Number(heightText);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`Could not determine PNG dimensions for ${outputPath}.`);
  }

  const tempDir = mkdtempSync(path.join(tmpdir(), "chatgpt-background-"));
  const tempOutputPath = path.join(tempDir, path.basename(outputPath));

  try {
    run("magick", [
      outputPath,
      "-alpha",
      "set",
      "-channel",
      "RGBA",
      "-fuzz",
      "8%",
      "-fill",
      "none",
      "-draw",
      "color 0,0 floodfill",
      "-draw",
      `color ${width - 1},0 floodfill`,
      "-draw",
      `color 0,${height - 1} floodfill`,
      "-draw",
      `color ${width - 1},${height - 1} floodfill`,
      `PNG32:${tempOutputPath}`,
    ]);
    copyFileSync(tempOutputPath, outputPath);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

function trimTransparentEdgesFromPng(outputPath: string): void {
  if (!commandExists("magick")) {
    console.warn(
      "Skipping transparent-edge trim because ImageMagick (`magick`) is not installed.",
    );
    return;
  }

  const tempDir = mkdtempSync(path.join(tmpdir(), "chatgpt-trim-"));
  const tempOutputPath = path.join(tempDir, path.basename(outputPath));

  try {
    run("magick", [
      outputPath,
      "-alpha",
      "set",
      "-background",
      "none",
      "-trim",
      "+repage",
      `PNG32:${tempOutputPath}`,
    ]);
    copyFileSync(tempOutputPath, outputPath);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

function shouldTrimDownloadedSprite(outputPath: string): boolean {
  const filename = path.basename(outputPath).toLowerCase();
  return filename.startsWith("station-");
}

function closeFrontPreviewDocument(): void {
  runAppleScriptCommand([
    'tell application "Preview" to if (count of documents) > 0 then close front document saving no',
  ]);
}

function resolveOutputPath(sprite: SpriteSpec | undefined, options: Options): string {
  if (options.outPath) {
    return path.isAbsolute(options.outPath)
      ? options.outPath
      : path.resolve(packageRoot, options.outPath);
  }

  if (!sprite) {
    throw new Error("--out is required when capturing without a selected sprite.");
  }

  return path.join(packageRoot, "src", "assets", "sprites", sprite.filename);
}

function downloadLatestImageToPath(
  outputPath: string,
  timeoutMs: number,
  pollMs: number,
  keepBackground: boolean,
): string {
  const previewDocumentName = openLatestChatGPTImageInPreview(timeoutMs, pollMs);
  if (previewDocumentName) {
    focusPreviewDocument(previewDocumentName);
  }

  try {
    const savedPath = saveFrontPreviewDocumentToDownloads(outputPath, timeoutMs, pollMs);
    if (!keepBackground) {
      removePlainWhiteBackgroundFromPng(savedPath);
      if (shouldTrimDownloadedSprite(savedPath)) {
        trimTransparentEdgesFromPng(savedPath);
      }
    }
    return savedPath;
  } finally {
    closeFrontPreviewDocument();
  }
}

async function confirmNextPrompt(): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(
      "Press Enter for the next sprite, or type q then Enter to stop. ",
    );
    return normalize(answer) !== "q";
  } finally {
    rl.close();
  }
}

function printSpriteSummary(sprite: SpriteSpec): void {
  console.log(`[${sprite.index}] ${sprite.filename} (${sprite.size})`);
  console.log(sprite.name);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.postprocessPath) {
    const targetPath = path.isAbsolute(options.postprocessPath)
      ? options.postprocessPath
      : path.resolve(packageRoot, options.postprocessPath);
    removePlainWhiteBackgroundFromPng(targetPath);
    if (shouldTrimDownloadedSprite(targetPath)) {
      trimTransparentEdgesFromPng(targetPath);
      console.log(`Removed plain white background and trimmed transparent edges for ${targetPath}`);
      return;
    }
    console.log(`Removed plain white background from ${targetPath}`);
    return;
  }

  const markdown = readFileSync(spritesDocPath, "utf8");
  const sprites = parseSpriteSpecs(markdown);
  const selected = selectSprites(sprites, options);

  if (options.list) {
    for (const sprite of sprites) {
      printSpriteSummary(sprite);
    }
    return;
  }

  if (options.captureLatest) {
    if (options.capture && !options.outPath && !options.selection) {
      throw new Error(
        "Use --capture-latest with --out, or pair --capture with --sprite.",
      );
    }

    if (selected.length > 1) {
      throw new Error("Capture-latest only supports one selected sprite at a time.");
    }

    const outputPath = resolveOutputPath(selected[0], options);
    const savedPath = downloadLatestImageToPath(
      outputPath,
      options.timeoutMs,
      options.pollMs,
      options.keepBackground,
    );
    console.log(`Downloaded latest ChatGPT image to ${savedPath}`);
    return;
  }
  if (selected.length === 0) {
    printUsage();
    throw new Error("No sprite prompts selected.");
  }

  if (!options.dryRun) {
    console.log(
      "This automation uses macOS Accessibility keystrokes. If it fails, grant Accessibility access to the terminal or app that runs this script.",
    );
  }

  for (let index = 0; index < selected.length; index += 1) {
    const sprite = selected[index];
    console.log("");
    printSpriteSummary(sprite);

    if (options.dryRun) {
      console.log("");
      console.log(sprite.prompt);
      continue;
    }

    const baselineState = options.capture ? getChatGPTState() : null;
    sendPromptToChatGPT(sprite.prompt, options);
    console.log("Prompt copied, pasted, and sent to ChatGPT.");

    if (options.capture) {
      if (options.outPath && selected.length > 1) {
        throw new Error("--out can only be used with one sprite when capturing.");
      }

      const readyState = waitForNewImage(
        baselineState as ChatGPTState,
        options.timeoutMs,
        options.pollMs,
      );

      const outputPath = resolveOutputPath(sprite, options);
      const savedPath = downloadLatestImageToPath(
        outputPath,
        options.timeoutMs,
        options.pollMs,
        options.keepBackground,
      );
      console.log(`Downloaded generated image to ${savedPath}.`);
    }

    if (!options.auto && index < selected.length - 1) {
      const shouldContinue = await confirmNextPrompt();
      if (!shouldContinue) {
        console.log("Stopped before sending the remaining prompts.");
        return;
      }
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
