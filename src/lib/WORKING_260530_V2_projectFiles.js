import { open, save } from "@tauri-apps/plugin-dialog";
import {
  create,
  readFile,
  readTextFile,
} from "@tauri-apps/plugin-fs";
import { Store } from "@tauri-apps/plugin-store";

const RECENT_PROJECTS_KEY = "recentProjects";
const RECENT_PROJECTS_LIMIT = 10;

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

  const bytes = await readFile(selected);
  const contents = new TextDecoder().decode(bytes);

  return {
    path: selected,
    contents,
  };
}

export async function readProjectFile(projectPath) {
  const bytes = await readFile(projectPath);
  return new TextDecoder().decode(bytes);
}

export async function chooseSaveProjectPath() {
  return await save({
    defaultPath: "project.cueproj",
    filters: [{ name: "Cue Project", extensions: ["cueproj"] }],
  });
}

export async function writeProjectFile(projectPath, projectData) {
  const file = await create(projectPath);
  const contents = JSON.stringify(projectData, null, 2);
  const bytes = new TextEncoder().encode(contents);

  await file.write(bytes);
  await file.close();
}

export async function chooseExportPdfPath() {
  return await save({
    defaultPath: "annotated.pdf",
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
}

export async function writePdfFile(pdfPath, pdfBytes) {
  const file = await create(pdfPath);

  await file.write(pdfBytes);
  await file.close();
}