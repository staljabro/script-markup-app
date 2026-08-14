import React, { useEffect, useRef, useState } from "react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { usePdfRenderer } from "./hooks/usePdfRenderer";
import {
  addRecentProject,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  chooseExportPdfPath,
  choosePdfFile,
  chooseProjectFile,
  chooseSaveProjectPath,
  getRecentProjects,
  readAutosaveProject,
  readProjectFile,
  writeAutosaveProject,
  writePdfFile,
  writeProjectFile,
} from "./lib/projectFiles";

const MARGIN_CUE_TYPES = ["SFX", "TM", "DCA"];
const FREE_CUE_TYPES = ["NOTE", "WARN", "MARK"];
const ALL_CUE_TYPES = [...MARGIN_CUE_TYPES, ...FREE_CUE_TYPES];

const isMarginCue = (type) => MARGIN_CUE_TYPES.includes(type);
const isFreeCue = (type) => FREE_CUE_TYPES.includes(type);
const hasLines = (type) => type === "SFX" || type === "TM";
const getCueTypeName = (type) => (type === "TM" ? "Scene" : type);
const getCueTypeOptionLabel = (type) =>
  type === "TM" ? "SCENE" : type;
const getCueTypeAbbreviation = (type) => (type === "TM" ? "SCENE" : type);

export default function App() {
  const { pages, pdfBytes, loadPdf } = usePdfRenderer();

  const [cues, setCues] = useState([]);
  const [undoStack, setUndoStack] = useState([]);
  const [mode, setMode] = useState("SFX");

  const [currentProjectPath, setCurrentProjectPath] = useState(null);
  const [recentProjects, setRecentProjects] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  const [lastAutosave, setLastAutosave] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedCueId, setSelectedCueId] = useState(null);
  const [showCloseDialog, setShowCloseDialog] = useState(false);

  const [showCueList, setShowCueList] = useState(true);

  const [cueTypeFilters, setCueTypeFilters] = useState(() =>
    Object.fromEntries(
      ALL_CUE_TYPES.map((type) => [type, true])
    )
  );

  const suppressNextSvgClickRef = useRef(false);
  const cueRefs = useRef({});
  const closeAfterChoiceRef = useRef(false);
  const dirtyRef = useRef(false);
  const pendingCloseRef = useRef(false);

  const [margins, setMargins] = useState({
    SFX: 150,
    TM: 100,
    DCA: 50,
  });

  const [colors, setColors] = useState({
    SFX: "#ff0000",
    TM: "#0000ff",
    DCA: "#008000",
    NOTE: "#8a2be2",
    WARN: "#ff9900",
    MARK: "#00a6a6",
  });

  const [styles, setStyles] = useState({
    SFX: { textSize: 10, lineWidth: 1.5 },
    TM: { textSize: 10, lineWidth: 1.5 },
    DCA: { textSize: 10, lineWidth: 1.5 },
    NOTE: { textSize: 10, lineWidth: 1.5 },
    WARN: { textSize: 10, lineWidth: 1.5 },
    MARK: { textSize: 10, lineWidth: 1.5 },
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
    setMargins(project.margins || margins);
    setColors((current) => ({ ...current, ...(project.colors || {}) }));
    setStyles((current) => ({ ...current, ...(project.styles || {}) }));
    setSelectedCueId(null);
    setIsDirty(false);
  };

  const pushUndo = (snapshot) => {
    setUndoStack((prev) =>
      [snapshot.map((cue) => ({ ...cue })), ...prev].slice(0, 10)
    );
  };

  const undoLastCueAction = () => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;

      const [lastSnapshot, ...remaining] = prev;
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

    const savePath = await chooseSaveProjectPath();
    if (!savePath) return false;

    await writeProjectFile(savePath, project);
    setCurrentProjectPath(savePath);

    const recent = await addRecentProject(savePath);
    setRecentProjects(recent);
    setIsDirty(false);

    return true;
  };

  const saveCurrentProjectNative = async () => {
    if (!currentProjectPath) {
      return await saveProjectAsNative();
    }

    const project = createProjectData();

    if (!project) {
      alert("Load a PDF before saving a project.");
      return false;
    }

    await writeProjectFile(currentProjectPath, project);

    const recent = await addRecentProject(currentProjectPath);
    setRecentProjects(recent);
    setIsDirty(false);

    return true;
  };

  useEffect(() => {
    getRecentProjects()
      .then(setRecentProjects)
      .catch((err) => console.error("Could not load recent projects:", err));
  }, []);

  useEffect(() => {
    const timer = setInterval(async () => {
      if (!isDirty || !pdfBytes) return;

      try {
        const project = createProjectData();
        if (!project) return;

        const path = await writeAutosaveProject(project);
        setLastAutosave(new Date().toLocaleTimeString());
        console.log("Autosaved:", path);
      } catch (err) {
        console.error("Autosave failed:", err);
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(timer);
  }, [isDirty, pdfBytes, cues, margins, colors, styles]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target.tagName.toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;

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
        return;
      }

      const key = e.key.toLowerCase();

      if (key === "s" || key === "1") setMode("SFX");
      if (key === "t" || key === "2") setMode("TM");
      if (key === "d" || key === "3") setMode("DCA");
      if (key === "n" || key === "4") setMode("NOTE");
      if (key === "w" || key === "5") setMode("WARN");
      if (key === "m" || key === "6") setMode("MARK");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoStack, cues, selectedCueId]);

  useEffect(() => {
  let unlisten;

  async function setupCloseHandler() {
    const appWindow = getCurrentWindow();

    unlisten = await appWindow.onCloseRequested(async (event) => {
  if (closeAfterChoiceRef.current) {
    return;
  }

  if (!dirtyRef.current) {
    return;
  }

  event.preventDefault();
  pendingCloseRef.current = true;
  setShowCloseDialog(true);
});
  }

  setupCloseHandler();

  return () => {
    if (unlisten) {
      unlisten();
    }
  };
}, []);

  const handleCloseSave = async () => {
  const saved = await saveCurrentProjectNative();

  if (!saved) return;

  setShowCloseDialog(false);

  if (pendingCloseRef.current) {
    closeAfterChoiceRef.current = true;
    pendingCloseRef.current = false;

    const appWindow = getCurrentWindow();
    await appWindow.close();
  }
};

const handleCloseDiscard = async () => {
  setShowCloseDialog(false);

  if (pendingCloseRef.current) {
    closeAfterChoiceRef.current = true;
    pendingCloseRef.current = false;

    const appWindow = getCurrentWindow();
    await appWindow.close();
  }
};

  const handleCloseCancel = () => {
  pendingCloseRef.current = false;
  setShowCloseDialog(false);
};

  const openPdfNative = async () => {
    const selected = await choosePdfFile();
    if (!selected) return;

    await loadPdf(selected.file);

    setCues([]);
    setUndoStack([]);
    setCurrentProjectPath(null);
    setSelectedCueId(null);
    setIsDirty(false);
  };

  const openProjectNative = async () => {
    try {
      const selected = await chooseProjectFile();
      if (!selected) return;

      const project = JSON.parse(selected.contents);

      await loadProjectData(project);
      setCurrentProjectPath(selected.path);

      const recent = await addRecentProject(selected.path);
      setRecentProjects(recent);
    } catch (err) {
      console.error("Open project failed:", err);
      alert(`Open project failed: ${String(err)}`);
    }
  };

  const openRecentProject = async (projectPath) => {
    if (!projectPath) return;

    try {
      const contents = await readProjectFile(projectPath);
      const project = JSON.parse(contents);

      await loadProjectData(project);
      setCurrentProjectPath(projectPath);

      const recent = await addRecentProject(projectPath);
      setRecentProjects(recent);
    } catch (err) {
      console.error("Recent project load error:", err);
      alert("Could not load recent project.");
    }
  };

  const recoverAutosave = async () => {
    try {
      const { project } = await readAutosaveProject();
      await loadProjectData(project);
      setCurrentProjectPath(null);
      setIsDirty(true);
      alert("Autosave recovered. Save this project to keep it.");
    } catch (err) {
      console.error("Autosave recovery failed:", err);
      alert("No autosave could be recovered.");
    }
  };

  const addCue = (pageIndex, x, y) => {
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
    if (!newLabel) return;

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

  const exportPDF = async () => {
    if (!pdfBytes) {
      alert("Load a PDF first");
      return;
    }

    try {
      const pdfDoc = await PDFDocument.load(new Uint8Array(pdfBytes));
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      cues.forEach((cue) => {
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

      const exportPath = await chooseExportPdfPath();
      if (!exportPath) return;

      await writePdfFile(exportPath, bytes);
    } catch (err) {
      console.error("EXPORT ERROR:", err);
      alert("Export failed. Check console.");
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

  return (
    <div style={{ padding: 20, display: "flex", gap: 16 }}>
      <main style={{ flex: 1 }}>
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 1000,
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 16,
            padding: 12,
            alignItems: "center",
            background: "rgba(245, 245, 245, 0.96)",
            border: "1px solid #ccc",
            borderRadius: 8,
            boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
            backdropFilter: "blur(6px)",
          }}
        >
          <button onClick={openPdfNative}>Open PDF</button>
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

          <label>
            Recent{" "}
            <select
              value=""
              onChange={(e) => openRecentProject(e.target.value)}
              disabled={recentProjects.length === 0}
            >
              <option value="">Open recent...</option>
              {recentProjects.map((projectPath) => (
                <option key={projectPath} value={projectPath}>
                  {projectPath}
                </option>
              ))}
            </select>
          </label>

          <label>
            Cue Type{" "}
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
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

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              padding: 8,
              border: `2px solid ${colors[mode]}`,
              borderRadius: 8,
              background: "white",
            }}
          >
            <strong>{getCueTypeName(mode)} Settings</strong>

            <label>
              Colour{" "}
              <input
                type="color"
                value={colors[mode]}
                onChange={(e) => updateSelectedColor(e.target.value)}
              />
            </label>

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

            {hasLines(mode) && (
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

        {pages.map((p, pageIndex) => (
          <div
            key={pageIndex}
            style={{
              position: "relative",
              display: "inline-block",
              marginBottom: 20,
            }}
          >
            <div
              ref={(el) => {
                if (el && !el.hasChildNodes()) {
                  p.canvas.style.display = "block";
                  el.appendChild(p.canvas);

                  const rect = p.canvas.getBoundingClientRect();

                  el.parentElement.style.width = `${rect.width}px`;
                  el.parentElement.style.height = `${rect.height}px`;
                }
              }}
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
                .filter((c) => c.page === pageIndex)
                .map((cue) => {
                  const color = colors[cue.type];
                  const cueStyle = styles[cue.type] || {
                    textSize: 10,
                    lineWidth: 1.5,
                  };

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
      </main>

      {showCueList && (
        <aside
          style={{
            width: 280,
            position: "sticky",
            top: 16,
            alignSelf: "flex-start",
            maxHeight: "calc(100vh - 32px)",
            overflow: "auto",
            border: "1px solid #ccc",
            borderRadius: 8,
            padding: 12,
            background: "#fafafa",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Cue List</h3>

          <input
            style={{
              width: "100%",
              marginBottom: 8,
            }}
            placeholder="Search cues..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div
            style={{
              marginBottom: 10,
              padding: 8,
              border: "1px solid #ddd",
              borderRadius: 6,
              background: "white",
            }}
          >
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
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                marginBottom: 4,
                padding: 6,
                border:
                  selectedCueId === cue.id
                    ? "2px solid #333"
                    : "1px solid #ccc",
                background:
                  selectedCueId === cue.id
                    ? "#fff8b0"
                    : "white",
                color: "black",
                cursor: "pointer",
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

      {showCloseDialog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 420,
              background: "white",
              borderRadius: 10,
              padding: 20,
              boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Unsaved Changes</h2>

            <p>
              This project has unsaved changes. Do you want to save before
              closing?
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 20,
              }}
            >
              <button onClick={handleCloseCancel}>Cancel</button>
              <button onClick={handleCloseDiscard}>Discard</button>
              <button onClick={handleCloseSave}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
