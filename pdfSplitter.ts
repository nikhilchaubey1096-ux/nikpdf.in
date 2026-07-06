import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";

export interface PageRange {
  start: number; // 1-indexed
  end: number;   // 1-indexed
}

/**
 * Parses and validates range strings like "1-5, 6-10"
 */
export function parseRanges(rangeStr: string, totalPages: number): { error: string | null; ranges: PageRange[] } {
  if (!rangeStr.trim()) {
    return { error: "Page range string cannot be empty.", ranges: [] };
  }

  const parts = rangeStr.split(",");
  const ranges: PageRange[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.includes("-")) {
      const sides = trimmed.split("-");
      if (sides.length !== 2) {
        return { error: `Invalid format in range "${trimmed}". Use start-end format (e.g., 1-5).`, ranges: [] };
      }
      const start = parseInt(sides[0].trim(), 10);
      const end = parseInt(sides[1].trim(), 10);

      if (isNaN(start) || isNaN(end)) {
        return { error: `Invalid numbers in range "${trimmed}".`, ranges: [] };
      }
      if (start < 1) {
        return { error: `Page number must be at least 1 (found ${start}).`, ranges: [] };
      }
      if (end > totalPages) {
        return { error: `Page number ${end} exceeds total document pages (${totalPages}).`, ranges: [] };
      }
      if (start > end) {
        return { error: `Start page (${start}) cannot be greater than end page (${end}).`, ranges: [] };
      }

      ranges.push({ start, end });
    } else {
      const pageNum = parseInt(trimmed, 10);
      if (isNaN(pageNum)) {
        return { error: `Invalid page number "${trimmed}".`, ranges: [] };
      }
      if (pageNum < 1) {
        return { error: `Page number must be at least 1 (found ${pageNum}).`, ranges: [] };
      }
      if (pageNum > totalPages) {
        return { error: `Page number ${pageNum} exceeds total document pages (${totalPages}).`, ranges: [] };
      }

      ranges.push({ start: pageNum, end: pageNum });
    }
  }

  if (ranges.length === 0) {
    return { error: "No valid ranges found.", ranges: [] };
  }

  return { error: null, ranges };
}

/**
 * Parses and validates selected pages list like "1,3,5-8"
 */
export function parseSelectedPages(pagesStr: string, totalPages: number): { error: string | null; pages: number[] } {
  const { error, ranges } = parseRanges(pagesStr, totalPages);
  if (error) {
    return { error, pages: [] };
  }

  const pagesSet = new Set<number>();
  for (const range of ranges) {
    for (let p = range.start; p <= range.end; p++) {
      pagesSet.add(p);
    }
  }

  // Sort pages numerically
  const sortedPages = Array.from(pagesSet).sort((a, b) => a - b);
  return { error: null, pages: sortedPages };
}

/**
 * Validates a single page number
 */
export function validatePageNumber(num: number, totalPages: number): string | null {
  if (isNaN(num) || num < 1) {
    return "Page number must be a valid positive integer.";
  }
  if (num > totalPages) {
    return `Page number ${num} exceeds total document pages (${totalPages}).`;
  }
  return null;
}

export interface SplitResult {
  fileName: string;
  blob: Blob;
  size: number;
  isZip: boolean;
}

/**
 * Executes a client-side PDF splitting operation
 */
export async function executeSplit(
  file: File,
  mode: "all" | "ranges" | "extract" | "every_n",
  options: {
    ranges?: string;
    selectedPages?: string;
    everyN?: number;
  },
  onProgress?: (progress: number) => void
): Promise<SplitResult> {
  const arrayBuffer = await file.arrayBuffer();

  // Signature verification
  const header = new Uint8Array(arrayBuffer.slice(0, 4));
  const headerStr = String.fromCharCode(...header);
  if (headerStr !== "%PDF") {
    throw new Error("Invalid PDF signature. The file does not start with %PDF.");
  }

  let originalDoc;
  try {
    originalDoc = await PDFDocument.load(arrayBuffer);
  } catch (loadErr: any) {
    const msg = (loadErr.message || "").toLowerCase();
    if (msg.includes("encrypt") || msg.includes("password") || msg.includes("decrypt")) {
      throw new Error("The file is password-protected or encrypted. Please remove password protection before splitting.");
    }
    // Retry with ignoreEncryption
    originalDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  }

  const totalPages = originalDoc.getPageCount();
  if (totalPages === 0) {
    throw new Error("The PDF document contains 0 pages.");
  }

  const baseName = file.name.substring(0, file.name.lastIndexOf(".")) || "Document";

  if (mode === "all") {
    // Mode 1: Split every page into separate PDF
    const zip = new JSZip();
    for (let i = 0; i < totalPages; i++) {
      const splitDoc = await PDFDocument.create();
      const [copiedPage] = await splitDoc.copyPages(originalDoc, [i]);
      splitDoc.addPage(copiedPage);

      const pdfBytes = await splitDoc.save();
      const pageNumStr = (i + 1).toString().padStart(Math.max(2, totalPages.toString().length), "0");
      zip.file(`${baseName}_Page_${pageNumStr}.pdf`, pdfBytes);

      if (onProgress) {
        onProgress(Math.floor(((i + 1) / totalPages) * 90));
      }
    }

    const zipContent = await zip.generateAsync({ type: "blob" }, (metadata) => {
      if (onProgress) {
        onProgress(90 + Math.floor(metadata.percent * 0.1));
      }
    });

    return {
      fileName: `${baseName}_every_page.zip`,
      blob: zipContent,
      size: zipContent.size,
      isZip: true,
    };
  }

  if (mode === "ranges") {
    // Mode 2: Split by page ranges
    const rangeStr = options.ranges || "";
    const { error, ranges } = parseRanges(rangeStr, totalPages);
    if (error) {
      throw new Error(error);
    }

    if (ranges.length === 1) {
      // Single range results in a single PDF file (no ZIP needed)
      const range = ranges[0];
      const pageIndices: number[] = [];
      for (let p = range.start; p <= range.end; p++) {
        pageIndices.push(p - 1);
      }

      const splitDoc = await PDFDocument.create();
      const copiedPages = await splitDoc.copyPages(originalDoc, pageIndices);
      copiedPages.forEach((page) => splitDoc.addPage(page));

      const pdfBytes = await splitDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      return {
        fileName: `${baseName}_Pages_${range.start}-${range.end}.pdf`,
        blob,
        size: blob.size,
        isZip: false,
      };
    } else {
      // Multiple ranges result in a ZIP containing those PDFs
      const zip = new JSZip();
      for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i];
        const pageIndices: number[] = [];
        for (let p = range.start; p <= range.end; p++) {
          pageIndices.push(p - 1);
        }

        const splitDoc = await PDFDocument.create();
        const copiedPages = await splitDoc.copyPages(originalDoc, pageIndices);
        copiedPages.forEach((page) => splitDoc.addPage(page));

        const pdfBytes = await splitDoc.save();
        zip.file(`${baseName}_Range_${range.start}-${range.end}.pdf`, pdfBytes);

        if (onProgress) {
          onProgress(Math.floor(((i + 1) / ranges.length) * 90));
        }
      }

      const zipContent = await zip.generateAsync({ type: "blob" }, (metadata) => {
        if (onProgress) {
          onProgress(90 + Math.floor(metadata.percent * 0.1));
        }
      });

      return {
        fileName: `${baseName}_ranges.zip`,
        blob: zipContent,
        size: zipContent.size,
        isZip: true,
      };
    }
  }

  if (mode === "extract") {
    // Mode 3: Extract selected pages into a single PDF
    const pagesStr = options.selectedPages || "";
    const { error, pages } = parseSelectedPages(pagesStr, totalPages);
    if (error) {
      throw new Error(error);
    }

    const pageIndices = pages.map(p => p - 1);
    const splitDoc = await PDFDocument.create();
    const copiedPages = await splitDoc.copyPages(originalDoc, pageIndices);
    copiedPages.forEach((page) => splitDoc.addPage(page));

    const pdfBytes = await splitDoc.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    return {
      fileName: `${baseName}_extracted.pdf`,
      blob,
      size: blob.size,
      isZip: false,
    };
  }

  if (mode === "every_n") {
    // Mode 4: Split every N pages
    const n = options.everyN || 1;
    if (n < 1 || n > totalPages) {
      throw new Error(`Split interval must be between 1 and ${totalPages}.`);
    }

    if (n === totalPages) {
      // Outputting original file basically
      const pdfBytes = await originalDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      return {
        fileName: `${baseName}_split_${n}.pdf`,
        blob,
        size: blob.size,
        isZip: false,
      };
    }

    const zip = new JSZip();
    let partNum = 1;
    const totalParts = Math.ceil(totalPages / n);

    for (let startPage = 1; startPage <= totalPages; startPage += n) {
      const endPage = Math.min(startPage + n - 1, totalPages);
      const pageIndices: number[] = [];
      for (let p = startPage; p <= endPage; p++) {
        pageIndices.push(p - 1);
      }

      const splitDoc = await PDFDocument.create();
      const copiedPages = await splitDoc.copyPages(originalDoc, pageIndices);
      copiedPages.forEach((page) => splitDoc.addPage(page));

      const pdfBytes = await splitDoc.save();
      zip.file(`${baseName}_Part_${partNum}_Pages_${startPage}-${endPage}.pdf`, pdfBytes);

      if (onProgress) {
        onProgress(Math.floor((partNum / totalParts) * 90));
      }
      partNum++;
    }

    const zipContent = await zip.generateAsync({ type: "blob" }, (metadata) => {
      if (onProgress) {
        onProgress(90 + Math.floor(metadata.percent * 0.1));
      }
    });

    return {
      fileName: `${baseName}_every_${n}_pages.zip`,
      blob: zipContent,
      size: zipContent.size,
      isZip: true,
    };
  }

  throw new Error("Invalid split mode specified.");
}
