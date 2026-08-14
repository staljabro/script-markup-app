import React, { useState } from "react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { usePdfRenderer } from "./hooks/usePdfRenderer";

export default function App() {
  const { pages, pdfBytes, loadPdf } = usePdfRenderer();

  const [cues, setCues] = useState([]);
  const [mode, setMode] = useState("SFX");

  const [margins, setMargins] = useState({
    SFX: 150,
    TM: 100,
    DCA: 50,
  });

  const [colors, setColors] = useState({
    SFX: "#ff0000",
    TM: "#0000ff",
    DCA: "#008000",
  });

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    loadPdf(file);
  };

  const addCue = (pageIndex, x, y) => {
    const label = prompt(`Enter ${mode} Cue:`);
    if (!label) return;

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

    setCues((prev) =>
      prev.map((c) => (c.id === id ? { ...c, label: newLabel } : c))
    );
  };

  const startDragCue = (e, cueId) => {
    e.stopPropagation();

    const svg = e.currentTarget.ownerSVGElement;
    const rect = svg.getBoundingClientRect();

    const move = (ev) => {
      const scaleY = svg.viewBox.baseVal.height / rect.height;
      const newY = (ev.clientY - rect.top) * scaleY;

      setCues((prev) =>
        prev.map((c) => (c.id === cueId ? { ...c, y: newY } : c))
      );
    };

    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const saveOverlay = () => {
    const blob = new Blob([JSON.stringify({ cues, margins, colors })], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "overlay.json";
    a.click();

    URL.revokeObjectURL(url);
  };

  const loadOverlay = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);

        setCues(data.cues || []);
        setMargins(data.margins || margins);
        setColors(data.colors || colors);
      } catch (err) {
        console.error("Overlay load error:", err);
        alert("Could not load overlay JSON.");
      }
    };

    reader.readAsText(file);
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

        const hex = colors[cue.type];
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        const color = rgb(r, g, b);

        const marginX = margins[cue.type];

        const [vTopX, vTopY] = viewport.convertToPdfPoint(
          cue.x,
          cue.y - 10
        );

        const [vBottomX, vBottomY] = viewport.convertToPdfPoint(
          cue.x,
          cue.y + 10
        );

        const [hStartX, hStartY] = viewport.convertToPdfPoint(
          cue.x,
          cue.y + 10
        );

        const [hEndX, hEndY] = viewport.convertToPdfPoint(
          marginX,
          cue.y + 10
        );

        const [textX, textY] = viewport.convertToPdfPoint(
          marginX + 5,
          cue.y + 5
        );

        if (cue.type !== "DCA") {
          page.drawLine({
            start: { x: vTopX, y: vTopY },
            end: { x: vBottomX, y: vBottomY },
            color,
          });

          page.drawLine({
            start: { x: hStartX, y: hStartY },
            end: { x: hEndX, y: hEndY },
            color,
          });
        }

        page.drawText(cue.label, {
          x: textX,
          y: textY,
          size: 10,
          font,
          color,
        });
      });

      const bytes = await pdfDoc.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "annotated.pdf";
      a.click();

      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("EXPORT ERROR:", err);
      alert("Export failed. Check console.");
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 10,
          alignItems: "center",
        }}
      >
        <label>
          Load PDF{" "}
          <input type="file" accept="application/pdf" onChange={handleFile} />
        </label>

        <label>
          Load Overlay{" "}
          <input
            type="file"
            accept="application/json"
            onChange={loadOverlay}
          />
        </label>

        <button onClick={saveOverlay}>Save Overlay</button>
        <button onClick={exportPDF}>Export PDF</button>

        <label>
          Cue Type{" "}
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="SFX">SFX</option>
            <option value="TM">TM</option>
            <option value="DCA">DCA</option>
          </select>
        </label>

        {Object.keys(margins).map((type) => (
          <label key={type}>
            {type} Margin{" "}
            <input
              type="range"
              min="0"
              max="600"
              value={margins[type]}
              onChange={(e) =>
                setMargins((m) => ({
                  ...m,
                  [type]: parseInt(e.target.value, 10),
                }))
              }
            />
          </label>
        ))}

        {Object.keys(colors).map((type) => (
          <label key={type}>
            {type} Colour{" "}
            <input
              type="color"
              value={colors[type]}
              onChange={(e) =>
                setColors((c) => ({
                  ...c,
                  [type]: e.target.value,
                }))
              }
            />
          </label>
        ))}
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
                const marginX = margins[cue.type];
                const color = colors[cue.type];

                return (
                  <g key={cue.id}>
                    {cue.type !== "DCA" && (
                      <>
                        <line
                          x1={cue.x}
                          y1={cue.y - 10}
                          x2={cue.x}
                          y2={cue.y + 10}
                          stroke={color}
                        />

                        <line
                          x1={cue.x}
                          y1={cue.y + 10}
                          x2={marginX}
                          y2={cue.y + 10}
                          stroke={color}
                        />
                      </>
                    )}

                    <text
                      x={marginX + 5}
                      y={cue.y + 5}
                      fill={color}
                      fontWeight="bold"
                      style={{ cursor: "grab", userSelect: "none" }}
                      onMouseDown={(e) => startDragCue(e, cue.id)}
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
              <g key={type}>
                <line
                  x1={margins[type]}
                  y1={0}
                  x2={margins[type]}
                  y2={p.height}
                  stroke={colors[type]}
                  strokeDasharray="5"
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
                    };

                    const up = () => {
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
  );
}