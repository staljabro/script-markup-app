// src/hooks/usePdfRenderer.js

import { useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const PDF_SCALE = 1.2;

export function usePdfRenderer() {
  const [pages, setPages] = useState([]);
  const [pdfBytes, setPdfBytes] = useState(null);

  const loadPdf = async (file) => {
    const data = await file.arrayBuffer();

    // Keep a clean copy for pdf-lib export.
    // PDF.js can detach/consume the original ArrayBuffer.
    setPdfBytes(data.slice(0));

    const pdfDoc = await pdfjsLib.getDocument({ data }).promise;
    const loadedPages = [];

    for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber++) {
      const page = await pdfDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: PDF_SCALE });

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      canvas.style.display = "block";
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      await page.render({
        canvasContext: context,
        viewport,
      }).promise;

      loadedPages.push({
        pageNumber,
        canvas,
        width: viewport.width,
        height: viewport.height,
        viewport,
      });
    }

    setPages(loadedPages);
  };

  return {
    pages,
    pdfBytes,
    loadPdf,
  };
}