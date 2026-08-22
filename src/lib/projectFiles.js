const AUTOSAVE_KEY = "script-markup-autosave";
const AUTOSAVE_DB = "script-markup";

function openAutosaveDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AUTOSAVE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("projects");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function accessAutosaveStore(mode, operation) {
  const db = await openAutosaveDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("projects", mode);
    const request = operation(transaction.objectStore("projects"));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

function chooseFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => resolve(input.files?.[0] || null), { once: true });
    input.click();
  });
}

function downloadFile(contents, fileName, type) {
  const blob = contents instanceof Blob ? contents : new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return window.btoa(binary);
}

export function base64ToArrayBuffer(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function choosePdfFile() {
  const file = await chooseFile("application/pdf,.pdf");
  return file ? { path: file.name, file } : null;
}

export async function chooseProjectFile() {
  const file = await chooseFile(".cueproj,application/json");
  return file ? { path: file.name, contents: await file.text() } : null;
}

export async function writeProjectFile(fileName, projectData) {
  downloadFile(JSON.stringify(projectData, null, 2), fileName || "project.cueproj", "application/json");
}

export async function writeProjectFileAs(projectData, suggestedName = "project.cueproj") {
  const contents = JSON.stringify(projectData, null, 2);

  if ("showSaveFilePicker" in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{
          description: "Script Markup Project",
          accept: { "application/json": [".cueproj"] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
      return handle.name;
    } catch (error) {
      if (error?.name === "AbortError") return null;
      throw error;
    }
  }

  const requestedName = window.prompt("Save project as:", suggestedName);
  if (requestedName === null) return null;
  const fileName = requestedName.toLowerCase().endsWith(".cueproj")
    ? requestedName
    : `${requestedName}.cueproj`;
  downloadFile(contents, fileName, "application/json");
  return fileName;
}

export async function writePdfFile(fileName, pdfBytes) {
  downloadFile(pdfBytes, fileName || "annotated.pdf", "application/pdf");
}

export async function writePdfFileAs(pdfBytes, suggestedName = "document.pdf") {
  if ("showSaveFilePicker" in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{
          description: "PDF Document",
          accept: { "application/pdf": [".pdf"] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(new Blob([pdfBytes], { type: "application/pdf" }));
      await writable.close();
      return handle.name;
    } catch (error) {
      if (error?.name === "AbortError") return null;
      throw error;
    }
  }

  const requestedName = window.prompt("Export PDF as:", suggestedName);
  if (requestedName === null) return null;
  const fileName = requestedName.toLowerCase().endsWith(".pdf")
    ? requestedName
    : `${requestedName}.pdf`;
  downloadFile(pdfBytes, fileName, "application/pdf");
  return fileName;
}

export async function writeAutosaveProject(projectData) {
  await accessAutosaveStore("readwrite", (store) => store.put(projectData, AUTOSAVE_KEY));
  return "browser storage";
}

export async function readAutosaveProject() {
  const project = await accessAutosaveStore("readonly", (store) => store.get(AUTOSAVE_KEY));
  if (!project) throw new Error("No autosave exists");
  return { path: AUTOSAVE_KEY, project };
}

export async function clearAutosaveProject() {
  await accessAutosaveStore("readwrite", (store) => store.delete(AUTOSAVE_KEY));
}
