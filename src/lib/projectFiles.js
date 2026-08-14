import { open, save } from "@tauri-apps/plugin-dialog";
import {
  create,
  mkdir,
  readFile,
} from "@tauri-apps/plugin-fs";
import { Store } from "@tauri-apps/plugin-store";
import { appDataDir, join } from "@tauri-apps/api/path";

const RECENT_PROJECTS_KEY = "recentProjects";
const RECENT_PROJECTS_LIMIT = 10;
const AUTOSAVE_FILE_NAME = "autosave.cueproj";

let settingsStore = null;

export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return window.btoa(binary);
}

export function base64ToArrayBuffer(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

async function getStore() {
  if (!settingsStore) {
    settingsStore = await Store.load("settings.json");
  }

  return settingsStore;
}

async function readTextFileAsBytes(path) {
  const bytes = await readFile(path);
  return new TextDecoder().decode(bytes);
}

async function writeBytesToFile(path, bytes) {
  const file = await create(path);
  await file.write(bytes);
  await file.close();
}

export async function getRecentProjects() {
  const store = await getStore();
  return (await store.get(RECENT_PROJECTS_KEY)) || [];
}

export async function addRecentProject(projectPath) {
  const store = await getStore();
  const existing = (await store.get(RECENT_PROJECTS_KEY)) || [];

  const next = [
    projectPath,
    ...existing.filter((path) => path !== projectPath),
  ].slice(0, RECENT_PROJECTS_LIMIT);

  await store.set(RECENT_PROJECTS_KEY, next);
  await store.save();

  return next;
}

export async function choosePdfFile() {
  const selected = await open({
    multiple: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (!selected) return null;

  const bytes = await readFile(selected);

  return {
    path: selected,
    file: new File([bytes], "document.pdf", {
      type: "application/pdf",
    }),
  };
}

export async function chooseProjectFile() {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Cue Project", extensions: ["cueproj"] }],
  });

  if (!selected) return null;

  return {
    path: selected,
    contents: await readTextFileAsBytes(selected),
  };
}

export async function readProjectFile(projectPath) {
  return await readTextFileAsBytes(projectPath);
}

export async function chooseSaveProjectPath() {
  return await save({
    defaultPath: "project.cueproj",
    filters: [{ name: "Cue Project", extensions: ["cueproj"] }],
  });
}

export async function writeProjectFile(projectPath, projectData) {
  const contents = JSON.stringify(projectData, null, 2);
  const bytes = new TextEncoder().encode(contents);

  await writeBytesToFile(projectPath, bytes);
}

export async function chooseExportPdfPath() {
  return await save({
    defaultPath: "annotated.pdf",
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
}

export async function writePdfFile(pdfPath, pdfBytes) {
  await writeBytesToFile(pdfPath, pdfBytes);
}

export async function getAutosavePath() {
  const dir = await appDataDir();
  await mkdir(dir, { recursive: true });
  return await join(dir, AUTOSAVE_FILE_NAME);
}

export async function writeAutosaveProject(projectData) {
  const autosavePath = await getAutosavePath();
  await writeProjectFile(autosavePath, projectData);
  return autosavePath;
}

export async function readAutosaveProject() {
  const autosavePath = await getAutosavePath();
  const contents = await readProjectFile(autosavePath);

  return {
    path: autosavePath,
    project: JSON.parse(contents),
  };
}