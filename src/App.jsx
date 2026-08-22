import { useEffect, useRef, useState } from "react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import {
  mdiAlertCircleOutline,
  mdiBackupRestore,
  mdiBorderNoneVariant,
  mdiCursorDefault,
  mdiContentSaveEditOutline,
  mdiContentSaveOutline,
  mdiDeleteOutline,
  mdiFileExportOutline,
  mdiFilePdfBox,
  mdiFolderOpenOutline,
  mdiEye,
  mdiFormatListBulletedSquare,
  mdiMarker,
  mdiMinusBoxOutline,
  mdiNoteTextOutline,
  mdiPencil,
  mdiPlusBoxOutline,
  mdiSineWave,
  mdiTrendingUp,
  mdiTuneVertical,
} from "@mdi/js";
import { usePdfRenderer } from "./hooks/usePdfRenderer";
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  choosePdfFile,
  chooseProjectFile,
  readAutosaveProject,
  writeAutosaveProject,
  writePdfFileAs,
  writeProjectFile,
  writeProjectFileAs,
} from "./lib/projectFiles";

const MARGIN_CUE_TYPES = ["SFX", "TM", "DCA"];
const FREE_CUE_TYPES = ["NOTE", "WARN", "MARK"];
const LINE_CUE_TYPES = ["FADE"];
const AREA_CUE_TYPES = ["BLOCK"];
const ALL_CUE_TYPES = [...MARGIN_CUE_TYPES, ...LINE_CUE_TYPES, ...AREA_CUE_TYPES, ...FREE_CUE_TYPES];

const isMarginCue = (type) => MARGIN_CUE_TYPES.includes(type);
const isFreeCue = (type) => FREE_CUE_TYPES.includes(type);
const hasLines = (type) => type === "SFX" || type === "TM" || type === "FADE";
const getCueTypeName = (type) => (type === "TM" ? "Scene" : type);
const getCueTypeOptionLabel = (type) =>
  type === "TM" ? "SCENE" : type;
const getCueTypeAbbreviation = (type) => (type === "TM" ? "SCENE" : type);
const FADE_TEXT_PADDING = 14;
const getFadeTextPosition = (cue, textSize) => ({
  x: cue.x,
  y: cue.y2 < cue.y
    ? cue.y - FADE_TEXT_PADDING
    : cue.y + textSize + FADE_TEXT_PADDING,
});

const getSafeProjectName = (name) =>
  (name.trim() || "Untitled").replace(/[<>:"/\\|?*]+/g, "-");

const getTimestamp = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
};

const TOOL_BUTTONS = [
  { type: "POINTER", label: "Pointer", icon: mdiCursorDefault },
  { type: "SFX", label: "SFX", icon: mdiSineWave },
  { type: "TM", label: "Scene", icon: mdiFormatListBulletedSquare },
  { type: "DCA", label: "DCA", icon: mdiTuneVertical },
  { type: "NOTE", label: "Note", icon: mdiNoteTextOutline },
  { type: "WARN", label: "Warn", icon: mdiAlertCircleOutline },
  { type: "MARK", label: "Mark", icon: mdiMarker },
  { type: "FADE", label: "Fade", icon: mdiTrendingUp },
  { type: "BLOCK", label: "Block", icon: mdiBorderNoneVariant },
];

function MaterialIcon({ path }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>;
}

function ToolbarIcon({ name }) {
  const common = {
    width: 19,
    height: 19,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  if (name === "save") return <svg {...common}><path d="M4 4h12l4 4v12H4z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></svg>;
  if (name === "undo") return <svg {...common}><path d="M9 7 4 12l5 5"/><path d="M5 12h8a7 7 0 0 1 7 7"/></svg>;
  if (name === "redo") return <svg {...common}><path d="m15 7 5 5-5 5"/><path d="M19 12h-8a7 7 0 0 0-7 7"/></svg>;
  if (name === "stack") return <svg {...common}><rect x="5" y="3" width="14" height="7" rx="1"/><rect x="5" y="14" width="14" height="7" rx="1"/></svg>;
  if (name === "columns") return <svg {...common}><rect x="3" y="4" width="8" height="16" rx="1"/><rect x="13" y="4" width="8" height="16" rx="1"/></svg>;
  if (name === "options") return <svg {...common}><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="8" cy="18" r="2" fill="currentColor"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.2.9-1.2 1.8M12 17h.01"/></svg>;
}

export default function App() {
  const { pages, pdfBytes, loadPdf, clearPdf } = usePdfRenderer();

  const [cues, setCues] = useState([]);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [mode, setMode] = useState("POINTER");

  const [currentProjectPath, setCurrentProjectPath] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [lastAutosave, setLastAutosave] = useState(null);
  const [search, setSearch] = useState("");
  const [showCueFilters, setShowCueFilters] = useState(false);
  const [selectedCueId, setSelectedCueId] = useState(null);
  const [fadeStart, setFadeStart] = useState(null);
  const [blockStart, setBlockStart] = useState(null);

  const [showCueList, setShowCueList] = useState(true);
  const [pageLayout, setPageLayout] = useState("single");
  const [displayScale, setDisplayScale] = useState(1);
  const [documentName, setDocumentName] = useState("Untitled");
  const [documentNameDraft, setDocumentNameDraft] = useState("Untitled");
  const [isEditingDocumentName, setIsEditingDocumentName] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [fileActionInProgress, setFileActionInProgress] = useState(null);
  const [showOptionsDrawer, setShowOptionsDrawer] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [expandedCueType, setExpandedCueType] = useState("SFX");

  const [cueTypeFilters, setCueTypeFilters] = useState(() =>
    Object.fromEntries(
      ALL_CUE_TYPES.map((type) => [type, true])
    )
  );
  const [hiddenCueTypes, setHiddenCueTypes] = useState(() =>
    Object.fromEntries(ALL_CUE_TYPES.map((type) => [type, false]))
  );

  const suppressNextSvgClickRef = useRef(false);
  const cueRefs = useRef({});
  const dirtyRef = useRef(false);
  const autosaveStateRef = useRef(null);
  const toolToolbarRef = useRef(null);

  useEffect(() => {
    const toolbar = toolToolbarRef.current;
    if (!toolbar) return undefined;

    const updateToolbarHeight = () => {
      document.documentElement.style.setProperty("--tool-toolbar-height", `${toolbar.offsetHeight}px`);
    };
    const observer = new ResizeObserver(updateToolbarHeight);
    observer.observe(toolbar);
    updateToolbarHeight();

    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--tool-toolbar-height");
    };
  }, []);

  const [margins, setMargins] = useState({
    SFX: 150,
    TM: 100,
    DCA: 50,
  });

  const [colors, setColors] = useState({
    POINTER: "#5b6474",
    SFX: "#cc00cc",
    TM: "#0000ff",
    DCA: "#ff0000",
    FADE: "#008000",
    BLOCK: "#c9c9c9",
    NOTE: "#8a2be2",
    WARN: "#ff8c00",
    MARK: "#00a6a6",
  });

  const [styles, setStyles] = useState({
    POINTER: { textSize: 20, lineWidth: 1.5 },
    SFX: { textSize: 20, lineWidth: 1.5 },
    TM: { textSize: 20, lineWidth: 1.5 },
    DCA: { textSize: 20, lineWidth: 1.5 },
    FADE: { textSize: 20, lineWidth: 1.5 },
    BLOCK: { textSize: 20, lineWidth: 1.5 },
    NOTE: { textSize: 20, lineWidth: 1.5 },
    WARN: { textSize: 20, lineWidth: 1.5 },
    MARK: { textSize: 20, lineWidth: 1.5 },
  });

  const [blockAppearance, setBlockAppearance] = useState({
    fillColor: "#ffffff",
    fillOpacity: 0.25,
    lineEnabled: true,
    fillEnabled: true,
  });

  const markDirty = () => setIsDirty(true);

  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  const createProjectData = () => {
    if (!pdfBytes) return null;

    return {
      app: "cue-pdf-annotator",
      version: 1,
      savedAt: new Date().toISOString(),
      pdfBase64: arrayBufferToBase64(pdfBytes),
      cues,
      margins,
      colors,
      styles,
      blockAppearance,
      documentName,
      hiddenCueTypes,
    };
  };

  const loadProjectData = async (project) => {
    if (!project.pdfBase64) {
      alert("Project file does not contain a PDF.");
      return;
    }

    const pdfBuffer = base64ToArrayBuffer(project.pdfBase64);
    const pdfBytesForFile = new Uint8Array(pdfBuffer);

    const pdfFile = new File([pdfBytesForFile], "project.pdf", {
      type: "application/pdf",
    });

    await loadPdf(pdfFile);

    setCues(project.cues || []);
    setUndoStack([]);
    setRedoStack([]);
    setDocumentName(project.documentName || "Untitled");
    setMargins(project.margins || margins);
    setColors((current) => ({ ...current, ...(project.colors || {}) }));
    setStyles((current) => ({ ...current, ...(project.styles || {}) }));
    setBlockAppearance((current) => ({
      ...current,
      ...(project.blockAppearance || {}),
    }));
    setHiddenCueTypes((current) => ({
      ...current,
      ...(project.hiddenCueTypes || {}),
    }));
    setSelectedCueId(null);
    setFadeStart(null);
    setBlockStart(null);
    setIsDirty(false);
  };

  const pushUndo = (snapshot) => {
    setRedoStack([]);
    setUndoStack((prev) =>
      [snapshot.map((cue) => ({ ...cue })), ...prev].slice(0, 10)
    );
  };

  const redoLastCueAction = () => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const [nextSnapshot, ...remaining] = prev;
      setUndoStack((undo) => [cues.map((cue) => ({ ...cue })), ...undo].slice(0, 10));
      setCues(nextSnapshot);
      markDirty();
      return remaining;
    });
  };

  const undoLastCueAction = () => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;

      const [lastSnapshot, ...remaining] = prev;
      setRedoStack((redo) => [cues.map((cue) => ({ ...cue })), ...redo].slice(0, 10));
      setCues(lastSnapshot);
      markDirty();

      return remaining;
    });
  };

  const saveProjectAsNative = async () => {
    const project = createProjectData();

    if (!project) {
      alert("Load a PDF before saving a project.");
      return false;
    }

    const suggestedName = `${getSafeProjectName(documentName)}.cueproj`;
    const savedName = await writeProjectFileAs(project, suggestedName);
    if (!savedName) return false;
    setCurrentProjectPath(savedName);
    setIsDirty(false);

    return true;
  };

  const saveCurrentProjectNative = async () => {
    const project = createProjectData();

    if (!project) {
      alert("Load a PDF before saving a project.");
      return false;
    }

    const fileName = `${getSafeProjectName(documentName)}_${getTimestamp()}.cueproj`;
    await writeProjectFile(fileName, project);
    setCurrentProjectPath(fileName);

    setIsDirty(false);

    return true;
  };

  useEffect(() => {
    autosaveStateRef.current = {
      isDirty,
      pdfBytes,
      cues,
      margins,
      colors,
      styles,
      blockAppearance,
      hiddenCueTypes,
      documentName,
    };
  }, [isDirty, pdfBytes, cues, margins, colors, styles, blockAppearance, hiddenCueTypes, documentName]);

  useEffect(() => {
    const timer = setInterval(async () => {
      const latest = autosaveStateRef.current;
      if (!latest?.isDirty || !latest.pdfBytes) return;

      try {
        const project = {
          app: "cue-pdf-annotator",
          version: 1,
          savedAt: new Date().toISOString(),
          pdfBase64: arrayBufferToBase64(latest.pdfBytes),
          cues: latest.cues,
          margins: latest.margins,
          colors: latest.colors,
          styles: latest.styles,
          blockAppearance: latest.blockAppearance,
          hiddenCueTypes: latest.hiddenCueTypes,
          documentName: latest.documentName,
        };

        const path = await writeAutosaveProject(project);
        setLastAutosave(new Date().toLocaleTimeString());
        console.log("Autosaved:", path);
      } catch (err) {
        console.error("Autosave failed:", err);
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target.tagName.toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && e.shiftKey) {
        e.preventDefault();
        redoLastCueAction();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redoLastCueAction();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoLastCueAction();
        return;
      }

      if (e.key === "Delete" && selectedCueId) {
        e.preventDefault();

        pushUndo(cues);
        markDirty();

        setCues((prev) => prev.filter((cue) => cue.id !== selectedCueId));
        setSelectedCueId(null);
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedCueId(null);
        setFadeStart(null);
        setBlockStart(null);
        setMode("POINTER");
        return;
      }

      const key = e.key.toLowerCase();

      if (["s", "t", "d", "n", "w", "m", "f", "b", "1", "2", "3", "4", "5", "6", "7", "8"].includes(key)) {
        setFadeStart(null);
        setBlockStart(null);
      }

      if (key === "s" || key === "1") setMode("SFX");
      if (key === "t" || key === "2") setMode("TM");
      if (key === "d" || key === "3") setMode("DCA");
      if (key === "n" || key === "4") setMode("NOTE");
      if (key === "w" || key === "5") setMode("WARN");
      if (key === "m" || key === "6") setMode("MARK");
      if (key === "f" || key === "7") setMode("FADE");
      if (key === "b" || key === "8") setMode("BLOCK");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoStack, redoStack, cues, selectedCueId]);

  useEffect(() => {
    const warnBeforeUnload = (event) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, []);

  const openPdfNative = async () => {
    if (pdfBytes) {
      const message = isDirty
        ? "You have unsaved changes. Loading a new PDF will replace the current PDF and remove its cues. Have you saved your changes?"
        : "Loading a new PDF will replace the current PDF and remove its cues. Do you want to continue?";
      if (!window.confirm(message)) return false;
    }
    const selected = await choosePdfFile();
    if (!selected) return false;

    await loadPdf(selected.file);

    setCues([]);
    setUndoStack([]);
    setRedoStack([]);
    setDocumentName(selected.file.name.replace(/\.pdf$/i, "") || "Untitled");
    setCurrentProjectPath(null);
    setSelectedCueId(null);
    setFadeStart(null);
    setBlockStart(null);
    setIsDirty(false);
    return true;
  };

  const removePdf = () => {
    if (!pdfBytes) return false;
    if (isDirty && !window.confirm("Remove this PDF and discard its unsaved cues?")) return false;

    clearPdf();
    setCues([]);
    setUndoStack([]);
    setRedoStack([]);
    setDocumentName("Untitled");
    setCurrentProjectPath(null);
    setSelectedCueId(null);
    setFadeStart(null);
    setBlockStart(null);
    setIsDirty(false);
    return true;
  };

  const openProjectNative = async () => {
    try {
      const selected = await chooseProjectFile();
      if (!selected) return false;

      const project = JSON.parse(selected.contents);

      await loadProjectData(project);
      setCurrentProjectPath(selected.path);
      if (!project.documentName) {
        setDocumentName(selected.path.replace(/\.cueproj$/i, "") || "Untitled");
      }
      return true;

    } catch (err) {
      console.error("Open project failed:", err);
      alert(`Open project failed: ${String(err)}`);
      return false;
    }
  };

  const recoverAutosave = async () => {
    try {
      const { project } = await readAutosaveProject();
      await loadProjectData(project);
      setCurrentProjectPath(null);
      setIsDirty(true);
      alert("Autosave recovered. Save this project to keep it.");
      return true;
    } catch (err) {
      console.error("Autosave recovery failed:", err);
      alert("No autosave could be recovered.");
      return false;
    }
  };

  const addCue = (pageIndex, x, y) => {
    if (mode === "POINTER") {
      setSelectedCueId(null);
      setFadeStart(null);
      setBlockStart(null);
      return;
    }

    if (mode === "FADE") {
      if (!fadeStart || fadeStart.page !== pageIndex) {
        setFadeStart({ page: pageIndex, x, y });
        return;
      }

      const start = fadeStart;
      setFadeStart(null);

      pushUndo(cues);
      markDirty();
      setCues((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          page: pageIndex,
          x: start.x,
          y: start.y,
          x2: x,
          y2: y,
          type: "FADE",
          label: "",
        },
      ]);
      return;
    }

    if (mode === "BLOCK") {
      if (!blockStart || blockStart.page !== pageIndex) {
        setBlockStart({ page: pageIndex, x, y });
        return;
      }

      const start = blockStart;
      setBlockStart(null);

      pushUndo(cues);
      markDirty();
      setCues((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          page: pageIndex,
          left: Math.min(start.x, x),
          top: Math.min(start.y, y),
          right: Math.max(start.x, x),
          bottom: Math.max(start.y, y),
          x: Math.min(start.x, x),
          y: Math.min(start.y, y),
          type: "BLOCK",
          label: "",
        },
      ]);
      return;
    }

    const label = prompt(`Enter ${getCueTypeName(mode)} Cue:`);
    if (!label) return;

    pushUndo(cues);
    markDirty();

    setCues((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        page: pageIndex,
        x,
        y,
        type: mode,
        label,
      },
    ]);
  };

  const updateCue = (id) => {
    const cue = cues.find((c) => c.id === id);
    if (!cue) return;

    const newLabel = prompt("Edit Cue:", cue.label);
    if (newLabel === null) return;
    if (!newLabel && cue.type !== "FADE" && cue.type !== "BLOCK") return;

    pushUndo(cues);
    markDirty();

    setCues((prev) =>
      prev.map((c) => (c.id === id ? { ...c, label: newLabel } : c))
    );
  };

  const startDragCueLine = (e, cueId) => {
    e.stopPropagation();
    e.preventDefault();

    const startSnapshot = cues.map((cue) => ({ ...cue }));
    const svg = e.currentTarget.ownerSVGElement;
    const rect = svg.getBoundingClientRect();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let didMove = false;

    const move = (ev) => {
      const deltaX = Math.abs(ev.clientX - startClientX);
      const deltaY = Math.abs(ev.clientY - startClientY);
      if (deltaX > 2 || deltaY > 2) didMove = true;

      const scaleX = svg.viewBox.baseVal.width / rect.width;
      const scaleY = svg.viewBox.baseVal.height / rect.height;
      const newX = (ev.clientX - rect.left) * scaleX;
      const newY = (ev.clientY - rect.top) * scaleY;

      setCues((prev) =>
        prev.map((c) =>
          c.id === cueId ? { ...c, x: newX, y: newY } : c
        )
      );
    };

    const up = () => {
      if (didMove) {
        pushUndo(startSnapshot);
        markDirty();

        suppressNextSvgClickRef.current = true;
        setTimeout(() => {
          suppressNextSvgClickRef.current = false;
        }, 0);
      }

      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const startDragFreeCue = (e, cueId) => {
    e.stopPropagation();
    e.preventDefault();

    const startSnapshot = cues.map((cue) => ({ ...cue }));
    const svg = e.currentTarget.ownerSVGElement;
    const rect = svg.getBoundingClientRect();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let didMove = false;

    const move = (ev) => {
      const deltaX = Math.abs(ev.clientX - startClientX);
      const deltaY = Math.abs(ev.clientY - startClientY);
      if (deltaX > 2 || deltaY > 2) didMove = true;

      const scaleX = svg.viewBox.baseVal.width / rect.width;
      const scaleY = svg.viewBox.baseVal.height / rect.height;
      const newX = (ev.clientX - rect.left) * scaleX;
      const newY = (ev.clientY - rect.top) * scaleY;

      setCues((prev) =>
        prev.map((c) => (c.id === cueId ? { ...c, x: newX, y: newY } : c))
      );
    };

    const up = () => {
      if (didMove) {
        pushUndo(startSnapshot);
        markDirty();

        suppressNextSvgClickRef.current = true;
        setTimeout(() => {
          suppressNextSvgClickRef.current = false;
        }, 0);
      }

      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const startDragFade = (e, cueId) => {
    e.stopPropagation();
    e.preventDefault();

    const original = cues.find((cue) => cue.id === cueId);
    if (!original) return;
    const startSnapshot = cues.map((cue) => ({ ...cue }));
    const svg = e.currentTarget.ownerSVGElement;
    const rect = svg.getBoundingClientRect();
    const scaleX = svg.viewBox.baseVal.width / rect.width;
    const scaleY = svg.viewBox.baseVal.height / rect.height;
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let didMove = false;

    setSelectedCueId(cueId);

    const move = (event) => {
      const dx = (event.clientX - startClientX) * scaleX;
      const dy = (event.clientY - startClientY) * scaleY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didMove = true;

      setCues((current) => current.map((cue) =>
        cue.id === cueId
          ? {
              ...cue,
              x: original.x + dx,
              y: original.y + dy,
              x2: original.x2 + dx,
              y2: original.y2 + dy,
            }
          : cue
      ));
    };

    const up = () => {
      if (didMove) {
        pushUndo(startSnapshot);
        markDirty();
        suppressNextSvgClickRef.current = true;
        setTimeout(() => { suppressNextSvgClickRef.current = false; }, 0);
      }
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const startDragFadeHandle = (e, cueId, endpoint) => {
    e.stopPropagation();
    e.preventDefault();

    const startSnapshot = cues.map((cue) => ({ ...cue }));
    const svg = e.currentTarget.ownerSVGElement;
    const rect = svg.getBoundingClientRect();
    let didMove = false;

    setSelectedCueId(cueId);

    const move = (event) => {
      const scaleX = svg.viewBox.baseVal.width / rect.width;
      const scaleY = svg.viewBox.baseVal.height / rect.height;
      const nextX = (event.clientX - rect.left) * scaleX;
      const nextY = (event.clientY - rect.top) * scaleY;
      didMove = true;

      setCues((current) => current.map((cue) => {
        if (cue.id !== cueId) return cue;
        return endpoint === "start"
          ? { ...cue, x: nextX, y: nextY }
          : { ...cue, x2: nextX, y2: nextY };
      }));
    };

    const up = () => {
      if (didMove) {
        pushUndo(startSnapshot);
        markDirty();
        suppressNextSvgClickRef.current = true;
        setTimeout(() => { suppressNextSvgClickRef.current = false; }, 0);
      }
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const startDragBlock = (e, cueId) => {
    e.stopPropagation();
    e.preventDefault();
    const original = cues.find((cue) => cue.id === cueId);
    if (!original) return;
    const snapshot = cues.map((cue) => ({ ...cue }));
    const svg = e.currentTarget.ownerSVGElement;
    const rect = svg.getBoundingClientRect();
    const scaleX = svg.viewBox.baseVal.width / rect.width;
    const scaleY = svg.viewBox.baseVal.height / rect.height;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    setSelectedCueId(cueId);

    const move = (event) => {
      const dx = (event.clientX - startX) * scaleX;
      const dy = (event.clientY - startY) * scaleY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
      setCues((current) => current.map((cue) => cue.id === cueId ? {
        ...cue,
        left: original.left + dx,
        right: original.right + dx,
        top: original.top + dy,
        bottom: original.bottom + dy,
        x: original.left + dx,
        y: original.top + dy,
      } : cue));
    };
    const up = () => {
      if (moved) {
        pushUndo(snapshot);
        markDirty();
        suppressNextSvgClickRef.current = true;
        setTimeout(() => { suppressNextSvgClickRef.current = false; }, 0);
      }
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const startDragBlockCorner = (e, cueId, corner) => {
    e.stopPropagation();
    e.preventDefault();
    const snapshot = cues.map((cue) => ({ ...cue }));
    const svg = e.currentTarget.ownerSVGElement;
    const rect = svg.getBoundingClientRect();
    let moved = false;
    setSelectedCueId(cueId);

    const move = (event) => {
      const scaleX = svg.viewBox.baseVal.width / rect.width;
      const scaleY = svg.viewBox.baseVal.height / rect.height;
      const nextX = (event.clientX - rect.left) * scaleX;
      const nextY = (event.clientY - rect.top) * scaleY;
      moved = true;
      setCues((current) => current.map((cue) => {
        if (cue.id !== cueId) return cue;
        const next = { ...cue };
        if (corner.includes("w")) next.left = Math.min(nextX, cue.right - 4);
        if (corner.includes("e")) next.right = Math.max(nextX, cue.left + 4);
        if (corner.includes("n")) next.top = Math.min(nextY, cue.bottom - 4);
        if (corner.includes("s")) next.bottom = Math.max(nextY, cue.top + 4);
        next.x = next.left;
        next.y = next.top;
        return next;
      }));
    };
    const up = () => {
      if (moved) {
        pushUndo(snapshot);
        markDirty();
        suppressNextSvgClickRef.current = true;
        setTimeout(() => { suppressNextSvgClickRef.current = false; }, 0);
      }
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const exportPDF = async () => {
    if (!pdfBytes) {
      alert("Load a PDF first");
      return false;
    }

    try {
      const pdfDoc = await PDFDocument.load(new Uint8Array(pdfBytes));
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      cues.forEach((cue) => {
        if (hiddenCueTypes[cue.type]) return;
        const page = pdfDoc.getPage(cue.page);
        const pageInfo = pages[cue.page];

        if (!pageInfo) return;

        const viewport = pageInfo.viewport;
        const cueStyle = styles[cue.type] || { textSize: 10, lineWidth: 1.5 };

        const hex = colors[cue.type] || "#000000";
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        const color = rgb(r, g, b);

        if (cue.type === "BLOCK") {
          const [pdfLeft, pdfBottom] = viewport.convertToPdfPoint(cue.left, cue.bottom);
          const [pdfRight, pdfTop] = viewport.convertToPdfPoint(cue.right, cue.top);
          const [labelX, labelY] = viewport.convertToPdfPoint(cue.left, cue.top - 6);
          const fillHex = blockAppearance.fillColor;
          const fillColor = rgb(
            parseInt(fillHex.slice(1, 3), 16) / 255,
            parseInt(fillHex.slice(3, 5), 16) / 255,
            parseInt(fillHex.slice(5, 7), 16) / 255
          );
          const rectangleOptions = {
            x: Math.min(pdfLeft, pdfRight),
            y: Math.min(pdfBottom, pdfTop),
            width: Math.abs(pdfRight - pdfLeft),
            height: Math.abs(pdfTop - pdfBottom),
          };
          if (blockAppearance.fillEnabled) {
            rectangleOptions.color = fillColor;
            rectangleOptions.opacity = blockAppearance.fillOpacity;
          }
          if (blockAppearance.lineEnabled) {
            rectangleOptions.borderColor = color;
            const [widthStart] = viewport.convertToPdfPoint(0, 0);
            const [widthEnd] = viewport.convertToPdfPoint(cueStyle.lineWidth, 0);
            rectangleOptions.borderWidth = Math.abs(widthEnd - widthStart);
          }
          if (blockAppearance.fillEnabled || blockAppearance.lineEnabled) {
            page.drawRectangle(rectangleOptions);
          }
          page.drawText(cue.label, {
            x: labelX,
            y: labelY,
            size: cueStyle.textSize,
            font,
            color,
          });
          return;
        }

        if (cue.type === "FADE") {
          const [startX, startY] = viewport.convertToPdfPoint(cue.x, cue.y);
          const [endX, endY] = viewport.convertToPdfPoint(cue.x2, cue.y2);
          const fadeText = getFadeTextPosition(cue, cueStyle.textSize);
          const [textCenterX, textY] = viewport.convertToPdfPoint(fadeText.x, fadeText.y);
          const textWidth = font.widthOfTextAtSize(cue.label, cueStyle.textSize);
          const [lineWidthStartX] = viewport.convertToPdfPoint(0, 0);
          const [lineWidthEndX] = viewport.convertToPdfPoint(cueStyle.lineWidth, 0);

          page.drawLine({
            start: { x: startX, y: startY },
            end: { x: endX, y: endY },
            color,
            thickness: Math.abs(lineWidthEndX - lineWidthStartX),
          });
          page.drawText(cue.label, {
            x: textCenterX - textWidth / 2,
            y: textY,
            size: cueStyle.textSize,
            font,
            color,
          });
          return;
        }

        if (isFreeCue(cue.type)) {
          const [textX, textY] = viewport.convertToPdfPoint(cue.x, cue.y);

          page.drawText(cue.label, {
            x: textX,
            y: textY,
            size: cueStyle.textSize,
            font,
            color,
          });

          return;
        }

        const marginX = margins[cue.type];
        const lineHeight = 10;

        const [vTopX, vTopY] = viewport.convertToPdfPoint(
          cue.x,
          cue.y - lineHeight
        );

        const [vBottomX, vBottomY] = viewport.convertToPdfPoint(
          cue.x,
          cue.y + lineHeight
        );

        const [hStartX, hStartY] = viewport.convertToPdfPoint(
          cue.x,
          cue.y + lineHeight
        );

        const [hEndX, hEndY] = viewport.convertToPdfPoint(
          marginX,
          cue.y + lineHeight
        );

        const [textX, textY] = viewport.convertToPdfPoint(
          marginX + 5,
          cue.y + 5
        );

        const [lineWidthStartX] = viewport.convertToPdfPoint(0, 0);
        const [lineWidthEndX] = viewport.convertToPdfPoint(
          cueStyle.lineWidth,
          0
        );
        const pdfLineWidth = Math.abs(lineWidthEndX - lineWidthStartX);

        if (hasLines(cue.type)) {
          page.drawLine({
            start: { x: vTopX, y: vTopY },
            end: { x: vBottomX, y: vBottomY },
            color,
            thickness: pdfLineWidth,
          });

          page.drawLine({
            start: { x: hStartX, y: hStartY },
            end: { x: hEndX, y: hEndY },
            color,
            thickness: pdfLineWidth,
          });
        }

        page.drawText(cue.label, {
          x: textX,
          y: textY,
          size: cueStyle.textSize,
          font,
          color,
        });
      });

      const bytes = await pdfDoc.save();

      const savedName = await writePdfFileAs(
        bytes,
        `${getSafeProjectName(documentName)}.pdf`
      );
      if (!savedName) return false;
      return true;
    } catch (err) {
      console.error("EXPORT ERROR:", err);
      alert("Export failed. Check console.");
      return false;
    }
  };

  const updateSelectedStyle = (property, value) => {
    setStyles((current) => ({
      ...current,
      [mode]: {
        ...current[mode],
        [property]: value,
      },
    }));
    markDirty();
  };

  const updateSelectedColor = (value) => {
    setColors((current) => ({
      ...current,
      [mode]: value,
    }));
    markDirty();
  };

  const jumpToCue = (cue) => {
    setSelectedCueId(cue.id);
    cueRefs.current[cue.id]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  const filteredCues = cues
    .filter((cue) => {
      if (!cueTypeFilters[cue.type]) return false;

      const q = search.toLowerCase();

      return (
        cue.label.toLowerCase().includes(q) ||
        cue.type.toLowerCase().includes(q) ||
        getCueTypeName(cue.type).toLowerCase().includes(q) ||
        getCueTypeAbbreviation(cue.type).toLowerCase().includes(q) ||
        String(cue.page + 1).includes(q)
      );
    })
    .sort((a, b) => {
      if (a.page !== b.page) {
        return a.page - b.page;
      }

      if (Math.abs(a.y - b.y) > 1) {
        return a.y - b.y;
      }

      return a.x - b.x;
    });

  const toggleCueTypeFilter = (type) => {
    setCueTypeFilters((current) => ({
      ...current,
      [type]: !current[type],
    }));
  };

  const showAllCueTypes = () => {
    setCueTypeFilters(
      Object.fromEntries(
        ALL_CUE_TYPES.map((type) => [type, true])
      )
    );
  };

  const hideAllCueTypes = () => {
    setCueTypeFilters(
      Object.fromEntries(
        ALL_CUE_TYPES.map((type) => [type, false])
      )
    );
  };

  const renderCueTypeOptions = (type) => (
    <div className="accordion-options" style={{ "--cue-color": colors[type] }}>
      <label className="hide-cue-type-option">
        <span>Hide this cue type</span>
        <input
          type="checkbox"
          checked={hiddenCueTypes[type]}
          onChange={(e) => {
            setHiddenCueTypes((current) => ({ ...current, [type]: e.target.checked }));
            setSelectedCueId(null);
            if (e.target.checked && mode === type) setMode("POINTER");
            markDirty();
          }}
        />
      </label>
      {type === "FADE" && <p>{fadeStart ? "Click the fade end point" : "Click the fade start point"}</p>}
      {type === "BLOCK" && <p>{blockStart ? "Click the opposite corner" : "Click the first corner"}</p>}

      {type !== "BLOCK" && (
        <label>
          Colour
          <input
            type="color"
            value={colors[type]}
            onChange={(e) => {
              setColors((current) => ({ ...current, [type]: e.target.value }));
              markDirty();
            }}
          />
        </label>
      )}

      {type === "BLOCK" && (
        <>
          <label>Line <input type="color" value={colors.BLOCK} disabled={!blockAppearance.lineEnabled} onChange={(e) => { setColors((current) => ({ ...current, BLOCK: e.target.value })); markDirty(); }} /></label>
          <label><span>No line</span><input type="checkbox" checked={!blockAppearance.lineEnabled} onChange={(e) => { setBlockAppearance((current) => ({ ...current, lineEnabled: !e.target.checked })); markDirty(); }} /></label>
          <label>Fill <input type="color" value={blockAppearance.fillColor} disabled={!blockAppearance.fillEnabled} onChange={(e) => { setBlockAppearance((current) => ({ ...current, fillColor: e.target.value })); markDirty(); }} /></label>
          <label><span>No fill</span><input type="checkbox" checked={!blockAppearance.fillEnabled} onChange={(e) => { setBlockAppearance((current) => ({ ...current, fillEnabled: !e.target.checked })); markDirty(); }} /></label>
          <label>
            Fill opacity
            <span className="option-slider"><input type="range" min="0" max="1" step="0.05" value={blockAppearance.fillOpacity} disabled={!blockAppearance.fillEnabled} onChange={(e) => { setBlockAppearance((current) => ({ ...current, fillOpacity: parseFloat(e.target.value) })); markDirty(); }} />{Math.round(blockAppearance.fillOpacity * 100)}%</span>
          </label>
        </>
      )}

      {isMarginCue(type) && (
        <label>
          Margin
          <span className="option-slider"><input type="range" min="0" max="600" value={margins[type]} onChange={(e) => { setMargins((current) => ({ ...current, [type]: parseInt(e.target.value, 10) })); markDirty(); }} />{Math.round(margins[type])}</span>
        </label>
      )}

      <label>
        Text size
        <span className="option-slider"><input type="range" min="6" max="28" step="1" value={styles[type].textSize} onChange={(e) => { setStyles((current) => ({ ...current, [type]: { ...current[type], textSize: parseFloat(e.target.value) } })); markDirty(); }} />{styles[type].textSize}</span>
      </label>

      {(hasLines(type) || type === "BLOCK") && (
        <label>
          Line width
          <span className="option-slider"><input type="range" min="0.5" max="8" step="0.5" value={styles[type].lineWidth} onChange={(e) => { setStyles((current) => ({ ...current, [type]: { ...current[type], lineWidth: parseFloat(e.target.value) } })); markDirty(); }} />{styles[type].lineWidth}</span>
        </label>
      )}
    </div>
  );

  const beginEditingDocumentName = () => {
    setDocumentNameDraft(documentName);
    setIsEditingDocumentName(true);
  };

  const commitDocumentName = () => {
    const nextName = documentNameDraft.trim() || "Untitled";
    if (nextName !== documentName) {
      setDocumentName(nextName);
      markDirty();
    }
    setIsEditingDocumentName(false);
  };

  const runFileAction = async (actionName, action) => {
    if (fileActionInProgress) return;
    setFileActionInProgress(actionName);
    try {
      const completed = await action();
      if (completed) setShowFileMenu(false);
    } catch (err) {
      console.error(`${actionName} failed:`, err);
      alert(`${actionName} failed. Check the console for details.`);
    } finally {
      setFileActionInProgress(null);
    }
  };

  return (
    <div className="app-shell">
      <main className="editor-main">
        <div className="app-toolbar">
          <div className="topbar-identity">
            <strong>SCRIPT MARKUP APP</strong>
            <small>PDF cue sheet annotator</small>
          </div>
          <div className="document-name-area">
            {isEditingDocumentName ? (
              <input
                className="document-name-editor"
                aria-label="Document name"
                value={documentNameDraft}
                autoFocus
                style={{ width: `${Math.max(8, documentNameDraft.length + 1)}ch` }}
                onChange={(e) => setDocumentNameDraft(e.target.value)}
                onBlur={commitDocumentName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitDocumentName();
                }}
              />
            ) : (
              <button className="document-name-display" onClick={beginEditingDocumentName} title="Rename document">
                <span>{documentName}</span>
                <MaterialIcon path={mdiPencil} />
              </button>
            )}
          </div>
          <button className="toolbar-primary" onClick={() => setShowFileMenu(true)}><ToolbarIcon name="save" />Save / Load</button>
          <button onClick={undoLastCueAction} disabled={undoStack.length === 0}><ToolbarIcon name="undo" />Undo</button>
          <button onClick={redoLastCueAction} disabled={redoStack.length === 0}><ToolbarIcon name="redo" />Redo</button>
          <button
            className={`toolbar-options ${showOptionsDrawer ? "is-active" : ""}`}
            onClick={() => setShowOptionsDrawer((open) => !open)}
            aria-expanded={showOptionsDrawer}
          >
            <ToolbarIcon name="options" />Options
          </button>
          <button className="toolbar-help" onClick={() => setShowHelp(true)} aria-label="Help" title="Help"><ToolbarIcon name="help" /></button>
        </div>

        <nav ref={toolToolbarRef} className="tool-toolbar" aria-label="Cue tools">
          <div className="tool-toolbar-group cue-tool-group">
            {TOOL_BUTTONS.map((tool) => (
              <button
                key={tool.type}
                className={mode === tool.type ? "is-active" : ""}
                onClick={() => {
                  setFadeStart(null);
                  setBlockStart(null);
                  setMode(tool.type);
                }}
                title={tool.label}
                aria-label={tool.label}
                aria-pressed={mode === tool.type}
              >
                <MaterialIcon path={tool.icon} />
                <span>{tool.label}</span>
              </button>
            ))}
          </div>
          <div className="tool-toolbar-group view-tool-group">
            <button
              className={`tool-layout-button ${pageLayout === "single" ? "is-active" : ""}`}
              onClick={() => setPageLayout("single")}
              aria-label="Pages in line"
              title="Pages in line"
              aria-pressed={pageLayout === "single"}
            >
              <ToolbarIcon name="stack" />
            </button>
            <button
              className={`tool-layout-button ${pageLayout === "spread" ? "is-active" : ""}`}
              onClick={() => setPageLayout("spread")}
              aria-label="Pages side by side"
              title="Pages side by side"
              aria-pressed={pageLayout === "spread"}
            >
              <ToolbarIcon name="columns" />
            </button>
            <label className="display-scale-control">
              <span>Scale</span>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.05"
                value={displayScale}
                onChange={(e) => setDisplayScale(parseFloat(e.target.value))}
              />
              <output>{Math.round(displayScale * 100)}%</output>
            </label>
            <button
              className={showCueList ? "is-active" : ""}
              onClick={() => setShowCueList((visible) => !visible)}
              aria-pressed={showCueList}
              title={showCueList ? "Hide cue list" : "Show cue list"}
            >
              <MaterialIcon path={mdiEye} />
              <span>Cue List</span>
            </button>
          </div>
        </nav>

        <div className={`options-drawer ${showOptionsDrawer ? "is-open" : ""}`}>
          <div className="drawer-header">
            <h2>Tool Options</h2>
            <button onClick={() => setShowOptionsDrawer(false)} aria-label="Close options">×</button>
          </div>
          <div className="cue-options-accordion">
            {TOOL_BUTTONS.filter((tool) => tool.type !== "POINTER").map(({ type }) => {
              const isExpanded = expandedCueType === type;
              return (
                <section className="cue-option-section" key={type} style={{ "--cue-color": colors[type] }}>
                  <button
                    className={`cue-option-trigger ${isExpanded ? "is-expanded" : ""}`}
                    onClick={() => {
                      setExpandedCueType(isExpanded ? null : type);
                    }}
                    aria-expanded={isExpanded}
                  >
                    <span className="cue-option-dot" />
                    <span className="cue-option-name">
                      <strong>{getCueTypeOptionLabel(type)}</strong>
                      {hiddenCueTypes[type] && <span className="hidden-status">(Hidden)</span>}
                    </span>
                    <span className="cue-option-chevron">
                      <MaterialIcon path={isExpanded ? mdiMinusBoxOutline : mdiPlusBoxOutline} />
                    </span>
                  </button>
                  {isExpanded && renderCueTypeOptions(type)}
                </section>
              );
            })}
          </div>
          <div className="app-brand">
            <span className="app-brand-mark">SM</span>
            <span>Script Markup</span>
          </div>
          <button onClick={openPdfNative}>Open PDF</button>
          <button onClick={removePdf} disabled={!pdfBytes}>Remove PDF</button>
          <button onClick={openProjectNative}>Open Project</button>
          <button onClick={saveCurrentProjectNative}>Save</button>
          <button onClick={saveProjectAsNative}>Save As</button>
          <button onClick={exportPDF}>Export PDF</button>
          <button onClick={recoverAutosave}>Recover Autosave</button>
          <button
            onClick={undoLastCueAction}
            disabled={undoStack.length === 0}
          >
            Undo
          </button>

          <button
            onClick={() => setShowCueList((v) => !v)}
          >
            {showCueList ? "Hide Cue List" : "Show Cue List"}
          </button>

          <button onClick={() => setPageLayout((layout) =>
            layout === "single" ? "spread" : "single"
          )}>
            {pageLayout === "single" ? "Pages Side by Side" : "Pages Stacked"}
          </button>

          <label>
            Cue Type{" "}
            <select
              value={mode}
              onChange={(e) => {
                setFadeStart(null);
                setBlockStart(null);
                setMode(e.target.value);
              }}
            >
              {ALL_CUE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {getCueTypeOptionLabel(type)}
                </option>
              ))}
            </select>
          </label>

          <span style={{ fontSize: 12, opacity: 0.75 }}>
            {currentProjectPath || "Untitled"}
            {isDirty ? " *" : ""}
            {lastAutosave ? ` · Autosaved ${lastAutosave}` : ""}
          </span>

          <div className="cue-settings" style={{ "--cue-color": colors[mode] }}>
            <strong>{getCueTypeName(mode)} Settings</strong>

            {mode === "FADE" && (
              <span style={{ fontSize: 12 }}>
                {fadeStart ? "Click the fade end point" : "Click the fade start point"}
              </span>
            )}

            {mode === "BLOCK" && (
              <span style={{ fontSize: 12 }}>
                {blockStart ? "Click the opposite corner" : "Click the first corner"}
              </span>
            )}

            {mode !== "BLOCK" && <label>
              Colour{" "}
              <input
                type="color"
                value={colors[mode]}
                onChange={(e) => updateSelectedColor(e.target.value)}
              />
            </label>}

            {mode === "BLOCK" && (
              <>
                <label>
                  Line{" "}
                  <input
                    type="color"
                    value={colors.BLOCK}
                    disabled={!blockAppearance.lineEnabled}
                    onChange={(e) => updateSelectedColor(e.target.value)}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={!blockAppearance.lineEnabled}
                    onChange={(e) => {
                      setBlockAppearance((current) => ({ ...current, lineEnabled: !e.target.checked }));
                      markDirty();
                    }}
                  /> No line
                </label>
                <label>
                  Fill{" "}
                  <input
                    type="color"
                    value={blockAppearance.fillColor}
                    disabled={!blockAppearance.fillEnabled}
                    onChange={(e) => {
                      setBlockAppearance((current) => ({ ...current, fillColor: e.target.value }));
                      markDirty();
                    }}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={!blockAppearance.fillEnabled}
                    onChange={(e) => {
                      setBlockAppearance((current) => ({ ...current, fillEnabled: !e.target.checked }));
                      markDirty();
                    }}
                  /> No fill
                </label>
                <label>
                  Fill opacity{" "}
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={blockAppearance.fillOpacity}
                    disabled={!blockAppearance.fillEnabled}
                    onChange={(e) => {
                      setBlockAppearance((current) => ({
                        ...current,
                        fillOpacity: parseFloat(e.target.value),
                      }));
                      markDirty();
                    }}
                  />
                  {Math.round(blockAppearance.fillOpacity * 100)}%
                </label>
              </>
            )}

            {isMarginCue(mode) && (
              <label>
                Margin{" "}
                <input
                  type="range"
                  min="0"
                  max="600"
                  value={margins[mode]}
                  onChange={(e) => {
                    setMargins((m) => ({
                      ...m,
                      [mode]: parseInt(e.target.value, 10),
                    }));
                    markDirty();
                  }}
                />
                <span style={{ minWidth: 32, display: "inline-block" }}>
                  {Math.round(margins[mode])}
                </span>
              </label>
            )}

            <label>
              Text Size{" "}
              <input
                type="range"
                min="6"
                max="28"
                step="1"
                value={styles[mode].textSize}
                onChange={(e) =>
                  updateSelectedStyle("textSize", parseFloat(e.target.value))
                }
              />
              <span style={{ minWidth: 24, display: "inline-block" }}>
                {styles[mode].textSize}
              </span>
            </label>

            {(hasLines(mode) || mode === "BLOCK") && (
              <label>
                Line Width{" "}
                <input
                  type="range"
                  min="0.5"
                  max="8"
                  step="0.5"
                  value={styles[mode].lineWidth}
                  onChange={(e) =>
                    updateSelectedStyle("lineWidth", parseFloat(e.target.value))
                  }
                />
                <span style={{ minWidth: 24, display: "inline-block" }}>
                  {styles[mode].lineWidth}
                </span>
              </label>
            )}
          </div>
        </div>

        {showFileMenu && (
          <div className="modal-backdrop" onMouseDown={() => setShowFileMenu(false)}>
            <section className="app-modal save-load-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="save-load-heading">
                <div>
                  <span className="modal-eyebrow">DOCUMENT CONTROL</span>
                  <h2>Save &amp; Load</h2>
                  <p>Open source files, manage your project, or produce a finished PDF.</p>
                </div>
                <button className="modal-close" onClick={() => setShowFileMenu(false)} aria-label="Close">×</button>
              </div>

              <div className="save-load-status">
                <strong>{documentName || "Untitled"}</strong>
                <span className={isDirty ? "is-unsaved" : ""}>{isDirty ? "Unsaved changes" : "Up to date"}</span>
                {lastAutosave && <span>Autosaved {lastAutosave}</span>}
              </div>

              <div className="file-action-group">
                <h3>Document</h3>
                <div className="file-actions">
                  <button onClick={() => runFileAction("Open PDF", openPdfNative)} disabled={Boolean(fileActionInProgress)}><MaterialIcon path={mdiFilePdfBox} /><span><strong>Open PDF</strong><small>Start with a PDF document</small></span></button>
                  <button onClick={() => runFileAction("Remove PDF", removePdf)} disabled={!pdfBytes || Boolean(fileActionInProgress)} className="is-danger"><MaterialIcon path={mdiDeleteOutline} /><span><strong>Remove PDF</strong><small>Clear the current document</small></span></button>
                </div>
              </div>

              <div className="file-action-group">
                <h3>Project</h3>
                <div className="file-actions">
                  <button onClick={() => runFileAction("Load Project", openProjectNative)} disabled={Boolean(fileActionInProgress)}><MaterialIcon path={mdiFolderOpenOutline} /><span><strong>Load Project</strong><small>Open a saved .cueproj file</small></span></button>
                  <button onClick={() => runFileAction("Save Project", saveCurrentProjectNative)} disabled={Boolean(fileActionInProgress)}><MaterialIcon path={mdiContentSaveOutline} /><span><strong>Save Project</strong><small>Download a timestamped copy</small></span></button>
                  <button onClick={() => runFileAction("Save Project As", saveProjectAsNative)} disabled={Boolean(fileActionInProgress)}><MaterialIcon path={mdiContentSaveEditOutline} /><span><strong>Save Project As</strong><small>Choose a name and save location</small></span></button>
                  <button onClick={() => runFileAction("Recover Autosave", recoverAutosave)} disabled={Boolean(fileActionInProgress)}><MaterialIcon path={mdiBackupRestore} /><span><strong>Recover Autosave</strong><small>Restore browser-stored work</small></span></button>
                </div>
              </div>

              <div className="file-action-group">
                <h3>Output</h3>
                <div className="file-actions file-actions--single">
                  <button className="is-primary" onClick={() => runFileAction("Export PDF", exportPDF)} disabled={!pdfBytes || Boolean(fileActionInProgress)}><MaterialIcon path={mdiFileExportOutline} /><span><strong>Export PDF</strong><small>Create the final annotated PDF</small></span></button>
                </div>
              </div>
            </section>
          </div>
        )}

        {showHelp && (
          <div className="modal-backdrop" onMouseDown={() => setShowHelp(false)}>
            <section className="app-modal help-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="help-heading">
                <div>
                  <span className="modal-eyebrow">SCRIPT MARKUP APP</span>
                  <h2>Help &amp; Guide</h2>
                  <p>Mark up, organise, save, and export your PDF cue sheets.</p>
                </div>
                <button className="modal-close" onClick={() => setShowHelp(false)} aria-label="Close">×</button>
              </div>

              <div className="help-content">
                <div className="help-card-grid">
                  <article className="help-card">
                    <h3>Getting started</h3>
                    <ol>
                      <li>Open <strong>Save / Load</strong> and select a source PDF.</li>
                      <li>Choose a tool from the toolbar beneath the header.</li>
                      <li>Click the PDF to create cues, then adjust their appearance in <strong>Options</strong>.</li>
                      <li>Save a project for later editing or export a finished PDF.</li>
                    </ol>
                  </article>

                  <article className="help-card">
                    <h3>Creating cues</h3>
                    <ul>
                      <li><strong>SFX, Scene, and DCA</strong> create margin-based annotations.</li>
                      <li><strong>Note, Warn, and Mark</strong> place text directly on the page.</li>
                      <li>Select <strong>Pointer</strong> when you want to work without adding cues.</li>
                      <li>Double-click cue text to rename it.</li>
                    </ul>
                  </article>

                  <article className="help-card">
                    <h3>Fade &amp; Block</h3>
                    <ul>
                      <li><strong>Fade</strong> uses two clicks to create a line between two points.</li>
                      <li><strong>Block</strong> uses two clicks to define opposite rectangle corners.</li>
                      <li>Drag either cue to move it. Use its round handles to reshape it.</li>
                      <li>Double-click the fade line or block body to add an optional label.</li>
                    </ul>
                  </article>

                  <article className="help-card">
                    <h3>View &amp; visibility</h3>
                    <ul>
                      <li>Switch between stacked and side-by-side page layouts in the tool strip.</li>
                      <li>Use <strong>Scale</strong> to resize pages without changing export geometry.</li>
                      <li>Toggle the cue list from the button beside the scale control.</li>
                      <li>Hidden cue types remain saved but do not appear on pages or PDF exports.</li>
                    </ul>
                  </article>

                  <article className="help-card">
                    <h3>Options &amp; cue list</h3>
                    <ul>
                      <li>Expand any tool row to change its colour, text size, line width, or margin.</li>
                      <li>BLOCK additionally supports fill colour, opacity, no fill, and no line.</li>
                      <li>Search cues by name, type, or page from the cue list.</li>
                      <li>The Filter accordion controls which cue types appear in the list.</li>
                    </ul>
                  </article>

                  <article className="help-card">
                    <h3>Save, load &amp; export</h3>
                    <ul>
                      <li><strong>Save Project</strong> downloads a timestamped project copy.</li>
                      <li><strong>Save Project As</strong> lets you choose its filename and location.</li>
                      <li><strong>Export PDF</strong> creates an annotated PDF using visible cues.</li>
                      <li>Autosave stores unsaved work in this browser every five minutes.</li>
                    </ul>
                  </article>
                </div>

                <article className="shortcut-card">
                  <h3>Keyboard &amp; pointer shortcuts</h3>
                  <div className="shortcut-grid">
                    <kbd>Esc</kbd><span>Cancel a pending cue, clear selection, and return to Pointer.</span>
                    <kbd>Delete</kbd><span>Remove the selected cue.</span>
                    <kbd>Ctrl/Cmd + Z</kbd><span>Undo the last cue action.</span>
                    <kbd>Ctrl/Cmd + Shift + Z</kbd><span>Redo the last undone action.</span>
                    <kbd>Ctrl/Cmd + Y</kbd><span>Redo on Windows-style keyboards.</span>
                    <kbd>Double-click</kbd><span>Edit a cue label, fade label, or block label.</span>
                    <kbd>Drag</kbd><span>Move cues or adjust visible endpoint and corner handles.</span>
                    <kbd>F / 7</kbd><span>Select Fade. Use B / 8 to select Block.</span>
                  </div>
                </article>
              </div>
            </section>
          </div>
        )}

        <div className={`pdf-pages pdf-pages--${pageLayout}`}>
        {pages.map((p, pageIndex) => (
          <div
            key={pageIndex}
            className="pdf-page"
            style={{
              width: `${p.width * displayScale}px`,
              height: `${p.height * displayScale}px`,
            }}
          >
            <div
              ref={(el) => {
                if (!el) return;
                p.canvas.style.display = "block";
                p.canvas.style.width = "100%";
                p.canvas.style.height = "100%";
                if (el.firstChild !== p.canvas) el.replaceChildren(p.canvas);
              }}
              style={{ width: "100%", height: "100%" }}
            />

            <svg
              width={p.width}
              height={p.height}
              viewBox={`0 0 ${p.width} ${p.height}`}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "all",
              }}
              onClick={(e) => {
                if (suppressNextSvgClickRef.current) {
                  suppressNextSvgClickRef.current = false;
                  return;
                }

                if (e.target !== e.currentTarget) return;

                const rect = e.currentTarget.getBoundingClientRect();
                const scaleX = p.width / rect.width;
                const scaleY = p.height / rect.height;

                addCue(
                  pageIndex,
                  (e.clientX - rect.left) * scaleX,
                  (e.clientY - rect.top) * scaleY
                );
              }}
            >
              {cues
                .filter((c) => c.page === pageIndex && !hiddenCueTypes[c.type])
                .map((cue) => {
                  const color = colors[cue.type];
                  const cueStyle = styles[cue.type] || {
                    textSize: 10,
                    lineWidth: 1.5,
                  };

                  if (cue.type === "BLOCK") {
                    const width = cue.right - cue.left;
                    const height = cue.bottom - cue.top;
                    const corners = [
                      ["nw", cue.left, cue.top],
                      ["ne", cue.right, cue.top],
                      ["sw", cue.left, cue.bottom],
                      ["se", cue.right, cue.bottom],
                    ];
                    return (
                      <g
                        key={cue.id}
                        ref={(el) => { cueRefs.current[cue.id] = el; }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCueId(cue.id);
                        }}
                      >
                        <rect
                          x={cue.left}
                          y={cue.top}
                          width={width}
                          height={height}
                          fill={blockAppearance.fillEnabled ? blockAppearance.fillColor : "none"}
                          fillOpacity={blockAppearance.fillOpacity}
                          stroke={blockAppearance.lineEnabled ? color : "none"}
                          strokeWidth={cueStyle.lineWidth}
                        />
                        {selectedCueId === cue.id && (
                          <rect
                            x={cue.left - 2}
                            y={cue.top - 2}
                            width={width + 4}
                            height={height + 4}
                            fill="none"
                            stroke="#facc15"
                            strokeWidth={2}
                            strokeDasharray="5 4"
                            pointerEvents="none"
                          />
                        )}
                        <rect
                          x={cue.left}
                          y={cue.top}
                          width={width}
                          height={height}
                          fill="transparent"
                          stroke="transparent"
                          strokeWidth={12}
                          style={{ cursor: "move" }}
                          onMouseDown={(e) => startDragBlock(e, cue.id)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            updateCue(cue.id);
                          }}
                        />
                        <text
                          x={cue.left}
                          y={cue.top - 6}
                          fill={color}
                          fontWeight="bold"
                          fontSize={cueStyle.textSize}
                          style={{ cursor: "move", userSelect: "none" }}
                          onMouseDown={(e) => startDragBlock(e, cue.id)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            updateCue(cue.id);
                          }}
                        >
                          {cue.label}
                        </text>
                        {corners.map(([corner, x, y]) => (
                          <circle
                            key={corner}
                            cx={x}
                            cy={y}
                            r={6}
                            fill="white"
                            stroke={color}
                            strokeWidth={2}
                            style={{ cursor: `${corner}-resize` }}
                            onMouseDown={(e) => startDragBlockCorner(e, cue.id, corner)}
                          />
                        ))}
                      </g>
                    );
                  }

                  if (cue.type === "FADE") {
                    const fadeText = getFadeTextPosition(cue, cueStyle.textSize);
                    return (
                      <g
                        key={cue.id}
                        ref={(el) => { cueRefs.current[cue.id] = el; }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCueId(cue.id);
                        }}
                      >
                        <line
                          x1={cue.x}
                          y1={cue.y}
                          x2={cue.x2}
                          y2={cue.y2}
                          stroke={selectedCueId === cue.id ? "yellow" : color}
                          strokeWidth={selectedCueId === cue.id ? cueStyle.lineWidth + 4 : cueStyle.lineWidth}
                        />
                        {selectedCueId === cue.id && (
                          <line
                            x1={cue.x}
                            y1={cue.y}
                            x2={cue.x2}
                            y2={cue.y2}
                            stroke={color}
                            strokeWidth={cueStyle.lineWidth}
                          />
                        )}
                        <line
                          x1={cue.x}
                          y1={cue.y}
                          x2={cue.x2}
                          y2={cue.y2}
                          stroke="transparent"
                          strokeWidth={12}
                          style={{ cursor: "move" }}
                          onMouseDown={(e) => startDragFade(e, cue.id)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            updateCue(cue.id);
                          }}
                        />
                        <text
                          x={fadeText.x}
                          y={fadeText.y}
                          fill={color}
                          fontWeight="bold"
                          fontSize={cueStyle.textSize}
                          textAnchor="middle"
                          style={{ cursor: "move", userSelect: "none" }}
                          onMouseDown={(e) => startDragFade(e, cue.id)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            updateCue(cue.id);
                          }}
                        >
                          {cue.label}
                        </text>
                        {selectedCueId === cue.id && (
                          <>
                            <circle
                              cx={cue.x}
                              cy={cue.y}
                              r={6}
                              fill="white"
                              stroke={color}
                              strokeWidth={2}
                              style={{ cursor: "grab" }}
                              onMouseDown={(e) => startDragFadeHandle(e, cue.id, "start")}
                            />
                            <circle
                              cx={cue.x2}
                              cy={cue.y2}
                              r={6}
                              fill="white"
                              stroke={color}
                              strokeWidth={2}
                              style={{ cursor: "grab" }}
                              onMouseDown={(e) => startDragFadeHandle(e, cue.id, "end")}
                            />
                          </>
                        )}
                      </g>
                    );
                  }

                  if (isFreeCue(cue.type)) {
                    return (
                      <text
                        key={cue.id}
                        ref={(el) => {
                          cueRefs.current[cue.id] = el;
                        }}
                        x={cue.x}
                        y={cue.y}
                        fill={color}
                        fontWeight="bold"
                        fontSize={cueStyle.textSize}
                        stroke={selectedCueId === cue.id ? "yellow" : "none"}
                        strokeWidth={selectedCueId === cue.id ? 3 : 0}
                        style={{ cursor: "grab", userSelect: "none" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCueId(cue.id);
                        }}
                        onMouseDown={(e) => startDragFreeCue(e, cue.id)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          updateCue(cue.id);
                        }}
                      >
                        {cue.label}
                      </text>
                    );
                  }

                  const marginX = margins[cue.type];

                  return (
                    <g
                      key={cue.id}
                      ref={(el) => {
                        cueRefs.current[cue.id] = el;
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCueId(cue.id);
                      }}
                    >
                      {hasLines(cue.type) && (
                        <>
                          <line
                            x1={cue.x}
                            y1={cue.y - 10}
                            x2={cue.x}
                            y2={cue.y + 10}
                            stroke={color}
                            strokeWidth={cueStyle.lineWidth}
                          />

                          <line
                            x1={cue.x}
                            y1={cue.y - 10}
                            x2={cue.x}
                            y2={cue.y + 10}
                            stroke="transparent"
                            strokeWidth={12}
                            style={{ cursor: "move" }}
                            onMouseDown={(e) => startDragCueLine(e, cue.id)}
                          />

                          <line
                            x1={cue.x}
                            y1={cue.y + 10}
                            x2={marginX}
                            y2={cue.y + 10}
                            stroke={color}
                            strokeWidth={cueStyle.lineWidth}
                          />
                        </>
                      )}

                      {selectedCueId === cue.id && (
                        <rect
                          x={marginX}
                          y={cue.y - cueStyle.textSize}
                          width={80}
                          height={cueStyle.textSize + 8}
                          fill="yellow"
                          opacity="0.25"
                        />
                      )}

                      <text
                        x={marginX + 5}
                        y={cue.y + 5}
                        fill={color}
                        fontWeight="bold"
                        fontSize={cueStyle.textSize}
                        style={{ cursor: "text", userSelect: "none" }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          updateCue(cue.id);
                        }}
                      >
                        {cue.label}
                      </text>
                    </g>
                  );
                })}

              {mode === "FADE" && fadeStart?.page === pageIndex && (
                <circle
                  cx={fadeStart.x}
                  cy={fadeStart.y}
                  r={6}
                  fill={colors.FADE}
                  stroke="white"
                  strokeWidth={2}
                  pointerEvents="none"
                />
              )}

              {mode === "BLOCK" && blockStart?.page === pageIndex && (
                <circle
                  cx={blockStart.x}
                  cy={blockStart.y}
                  r={6}
                  fill={colors.BLOCK}
                  stroke="white"
                  strokeWidth={2}
                  pointerEvents="none"
                />
              )}

              {Object.keys(margins).map((type) => (
                <g key={type} onClick={(e) => e.stopPropagation()}>
                  <line
                    x1={margins[type]}
                    y1={0}
                    x2={margins[type]}
                    y2={p.height}
                    stroke={colors[type]}
                    strokeDasharray="5"
                    strokeWidth={type === mode ? 2 : 1}
                    opacity={type === mode ? 1 : 0.55}
                  />

                  <rect
                    x={margins[type] - 6}
                    y={0}
                    width={12}
                    height={p.height}
                    fill="transparent"
                    style={{ cursor: "ew-resize" }}
                    onMouseDown={(e) => {
                      e.stopPropagation();

                      const svg = e.currentTarget.ownerSVGElement;
                      const rect = svg.getBoundingClientRect();

                      const move = (ev) => {
                        const scaleX = svg.viewBox.baseVal.width / rect.width;
                        const newX = (ev.clientX - rect.left) * scaleX;

                        setMargins((m) => ({
                          ...m,
                          [type]: newX,
                        }));
                        markDirty();
                      };

                      const up = () => {
                        suppressNextSvgClickRef.current = true;
                        setTimeout(() => {
                          suppressNextSvgClickRef.current = false;
                        }, 0);

                        window.removeEventListener("mousemove", move);
                        window.removeEventListener("mouseup", up);
                      };

                      window.addEventListener("mousemove", move);
                      window.addEventListener("mouseup", up);
                    }}
                  />
                </g>
              ))}
            </svg>
          </div>
        ))}
        </div>
      </main>

      {showCueList && (
        <aside className="cue-list-panel">
          <h3 style={{ marginTop: 0 }}>Cue List</h3>

          <input
            className="cue-search"
            placeholder="Search cues..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <button
            className={`cue-filter-trigger ${showCueFilters ? "is-expanded" : ""}`}
            onClick={() => setShowCueFilters((visible) => !visible)}
            aria-expanded={showCueFilters}
          >
            <span>Filters</span>
            <span className="cue-filter-summary">
              {Object.values(cueTypeFilters).filter(Boolean).length}/{ALL_CUE_TYPES.length}
            </span>
            <span className="cue-filter-chevron">
              <MaterialIcon path={showCueFilters ? mdiMinusBoxOutline : mdiPlusBoxOutline} />
            </span>
          </button>

          {showCueFilters && (
          <div className="cue-filter-card">
            <div
              style={{
                marginBottom: 6,
                fontWeight: "bold",
                fontSize: 12,
              }}
            >
              Cue Types
            </div>

            {ALL_CUE_TYPES.map((type) => (
              <label
                key={type}
                style={{
                  display: "block",
                  fontSize: 12,
                }}
              >
                <input
                  type="checkbox"
                  checked={cueTypeFilters[type]}
                  onChange={() =>
                    toggleCueTypeFilter(type)
                  }
                />{" "}
                <span
                  style={{
                    color: colors[type],
                    fontWeight: "bold",
                  }}
                >
                  {getCueTypeOptionLabel(type)}
                </span>
                {hiddenCueTypes[type] && <span className="hidden-status">(Hidden)</span>}
              </label>
            ))}

            <div
              style={{
                marginTop: 8,
                display: "flex",
                gap: 4,
              }}
            >
              <button
                style={{ flex: 1 }}
                onClick={showAllCueTypes}
              >
                All
              </button>

              <button
                style={{ flex: 1 }}
                onClick={hideAllCueTypes}
              >
                None
              </button>
            </div>
          </div>
          )}

          <div
            style={{
              marginBottom: 8,
              fontSize: 12,
              opacity: 0.75,
            }}
          >
            Showing {filteredCues.length} of {cues.length}
          </div>

          {filteredCues.map((cue) => (
            <button
              key={cue.id}
              onClick={() => jumpToCue(cue)}
              className={`cue-list-item${selectedCueId === cue.id ? " is-selected" : ""}${hiddenCueTypes[cue.type] ? " is-hidden" : ""}`}
              style={{
                "--cue-color": colors[cue.type],
              }}
            >
              <strong
                style={{
                  color: colors[cue.type],
                }}
              >
                {getCueTypeAbbreviation(cue.type)}
              </strong>{" "}
              {cue.label}

              <br />

              <small>
                Page {cue.page + 1}
              </small>
            </button>
          ))}
        </aside>
      )}

    </div>
  );
}
