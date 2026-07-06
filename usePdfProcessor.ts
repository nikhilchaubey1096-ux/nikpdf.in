import { useState, useCallback } from "react";
import { ToolDef, ProcessingState, ProcessingStatus, HistoryRecord } from "../types";
import { validateFiles } from "../utils/validation";
import { PDFDocument, degrees } from "pdf-lib";
import { executeSplit } from "../utils/pdfSplitter";

function sanitizeErrorMessage(error: any): string {
  if (!error) return "An unexpected error occurred while processing.";
  
  const msg = typeof error === "string" ? error : (error.message || "");
  const lowerMsg = msg.toLowerCase();
  
  // 1. JSON parsing or Unexpected token '<'
  if (
    lowerMsg.includes("unexpected token") || 
    lowerMsg.includes("json") || 
    lowerMsg.includes("syntaxerror") ||
    lowerMsg.includes("unexpected character")
  ) {
    return "We couldn't process your document. Please try again.";
  }
  
  // 2. HTML returned
  if (lowerMsg.includes("html") || lowerMsg.includes("<!doctype") || lowerMsg.includes("<html")) {
    return "The server encountered an issue. Please try again later.";
  }
  
  // 3. Failed to fetch or network errors
  if (
    lowerMsg.includes("failed to fetch") || 
    lowerMsg.includes("networkerror") || 
    lowerMsg.includes("network error") || 
    lowerMsg.includes("fetch") ||
    lowerMsg.includes("offline") ||
    lowerMsg.includes("cors")
  ) {
    return "A network or connection issue occurred. Please check your internet connection and try again.";
  }
  
  // 4. Undefined/Null/TypeError / internal JS crashes
  if (
    lowerMsg.includes("typeerror") || 
    lowerMsg.includes("cannot read properties") || 
    lowerMsg.includes("null") || 
    lowerMsg.includes("undefined") || 
    lowerMsg.includes("referenceerror")
  ) {
    return "An unexpected error occurred. Please refresh the page and try again.";
  }
  
  // 5. Stack trace signatures or internal paths
  if (
    lowerMsg.includes("at ") || 
    lowerMsg.includes("node_modules") || 
    lowerMsg.includes("/tmp/") || 
    lowerMsg.includes("stack") ||
    lowerMsg.includes("internal server error")
  ) {
    return "An unexpected server error occurred. Please try again.";
  }
  
  // 6. Generic ghostscript or server crash references
  if (
    lowerMsg.includes("ghostscript") || 
    lowerMsg.includes("gs") || 
    lowerMsg.includes("child_process") || 
    lowerMsg.includes("exec")
  ) {
    return "We couldn't process your document. Please ensure it is not password-protected and try again.";
  }

  // 7. Standard friendly pass-through of user-facing application errors
  return msg;
}

interface UsePdfProcessorReturn {
  state: ProcessingState;
  processFiles: (files: File[], tool: ToolDef, options?: Record<string, any>) => Promise<void>;
  resetState: () => void;
  history: HistoryRecord[];
}

export function usePdfProcessor(): UsePdfProcessorReturn {
  const [state, setState] = useState<ProcessingState>({
    status: "idle",
    progress: 0,
    error: null,
    outputName: null,
    outputUrl: null,
    outputSize: null,
  });

  const [history, setHistory] = useState<HistoryRecord[]>(() => {
    try {
      const stored = localStorage.getItem("nikpdf_history");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const resetState = useCallback(() => {
    setState({
      status: "idle",
      progress: 0,
      error: null,
      outputName: null,
      outputUrl: null,
      outputSize: null,
    });
  }, []);

  const addToHistory = useCallback((record: HistoryRecord) => {
    setHistory((prev) => {
      const updated = [record, ...prev].slice(0, 50); // limit to last 50 items
      try {
        localStorage.setItem("nikpdf_history", JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to write history to localStorage", e);
      }
      return updated;
    });
  }, []);

  const processFiles = useCallback(async (
    files: File[], 
    tool: ToolDef, 
    options: Record<string, any> = {}
  ) => {
    // 1. Initial Validation
    const validation = validateFiles(files, tool);
    if (!validation.isValid) {
      setState({
        status: "failed",
        progress: 0,
        error: validation.error || "Validation failed.",
        outputName: null,
        outputUrl: null,
        outputSize: null,
      });
      return;
    }

    // Runtime detection for Google AI Studio Preview vs Standard Server
    const isAiStudioPreview = typeof window !== "undefined" && (
      window.location.hostname.includes("run.app") ||
      window.location.hostname.includes("ai.studio") ||
      window.location.hostname.includes("web-preview") ||
      window.location.hostname.includes("ais-pre") ||
      window.location.hostname.includes("ais-dev")
    );

    if (isAiStudioPreview && tool.id === "merge-pdf") {
      console.log("Running in Browser Mode");
      
      setState({
        status: "processing",
        progress: 20,
        error: null,
        outputName: null,
        outputUrl: null,
        outputSize: null,
      });

      try {
        const mergedPdf = await PDFDocument.create();
        const totalFiles = files.length;

        for (let i = 0; i < totalFiles; i++) {
          const file = files[i];
          
          // Validate PDF signature or standard check
          const ext = file.name.split(".").pop()?.toLowerCase();
          if (ext !== "pdf" && file.type !== "application/pdf") {
            throw new Error(`Unsupported file type: "${file.name}" is not a PDF file.`);
          }
          if (file.size === 0) {
            throw new Error(`The file "${file.name}" is empty. Please upload a valid PDF.`);
          }

          // Read uploaded PDF with FileReader
          const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              if (reader.result instanceof ArrayBuffer) {
                resolve(reader.result);
              } else {
                reject(new Error(`Failed to read file "${file.name}"`));
              }
            };
            reader.onerror = () => reject(new Error(`Failed to read file "${file.name}"`));
            reader.readAsArrayBuffer(file);
          });

          // Signature verification
          const header = new Uint8Array(arrayBuffer.slice(0, 4));
          const headerStr = String.fromCharCode(...header);
          if (headerStr !== "%PDF") {
            throw new Error(`Invalid PDF signature in "${file.name}". The file does not start with %PDF.`);
          }

          let pdf;
          try {
            pdf = await PDFDocument.load(arrayBuffer);
          } catch (loadErr: any) {
            const msg = (loadErr.message || "").toLowerCase();
            if (msg.includes("encrypt") || msg.includes("password") || msg.includes("decrypt")) {
              throw new Error(`The file "${file.name}" is password-protected or encrypted. Please remove password protection before merging.`);
            }
            pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
          }

          const totalPages = pdf.getPageCount();
          if (totalPages === 0) {
            throw new Error(`The file "${file.name}" contains 0 pages.`);
          }

          const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
          copiedPages.forEach((page) => mergedPdf.addPage(page));

          // Set intermediate progress
          const currentProgress = Math.min(95, Math.floor(20 + ((i + 1) / totalFiles) * 70));
          setState(prev => ({ ...prev, progress: currentProgress }));
        }

        const mergedPdfBytes = await mergedPdf.save();
        const blob = new Blob([mergedPdfBytes], { type: "application/pdf" });
        const fileName = "Merged_Document.pdf";
        const downloadUrl = URL.createObjectURL(blob);

        // Download directly in browser
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setState({
          status: "completed",
          progress: 100,
          error: null,
          outputName: fileName,
          outputUrl: downloadUrl,
          outputSize: blob.size,
        });

        const historyLog: HistoryRecord = {
          id: Math.random().toString(36).substring(7),
          toolId: tool.id,
          fileName: files.map(f => f.name).join(", "),
          fileSize: files.reduce((sum, f) => sum + f.size, 0),
          outputName: fileName,
          outputSize: blob.size,
          status: "success",
          processedAt: new Date().toISOString(),
        };
        addToHistory(historyLog);
        return;
      } catch (err: any) {
        console.error("[CLIENT-SIDE MERGE ERROR]", err);
        const errorMsg = sanitizeErrorMessage(err.message || "An error occurred during client-side merge.");
        setState({
          status: "failed",
          progress: 0,
          error: errorMsg,
          outputName: null,
          outputUrl: null,
          outputSize: null,
        });

        const historyLog: HistoryRecord = {
          id: Math.random().toString(36).substring(7),
          toolId: tool.id,
          fileName: files.map(f => f.name).join(", "),
          fileSize: files.reduce((sum, f) => sum + f.size, 0),
          status: "failed",
          processedAt: new Date().toISOString(),
          errorMessage: errorMsg,
        };
        addToHistory(historyLog);
        return;
      }
    }

    if (isAiStudioPreview && tool.id === "organize-pdf") {
      console.log("Running in Browser Mode - Organize PDF");
      
      setState({
        status: "processing",
        progress: 10,
        error: null,
        outputName: null,
        outputUrl: null,
        outputSize: null,
      });

      try {
        const file = files[0];
        const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (reader.result instanceof ArrayBuffer) {
              resolve(reader.result);
            } else {
              reject(new Error(`Failed to read file "${file.name}"`));
            }
          };
          reader.onerror = () => reject(new Error(`Failed to read file "${file.name}"`));
          reader.readAsArrayBuffer(file);
        });

        let sourcePdf;
        try {
          sourcePdf = await PDFDocument.load(arrayBuffer, {
            password: options.password
          } as any);
        } catch (loadErr: any) {
          sourcePdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true } as any);
        }

        const outputPdf = await PDFDocument.create();
        const pagesToCompile = options.pages || [];
        const totalPagesToCompile = pagesToCompile.length;

        for (let i = 0; i < totalPagesToCompile; i++) {
          const pageItem = pagesToCompile[i];
          const [copiedPage] = await outputPdf.copyPages(sourcePdf, [pageItem.originalPageNum - 1]);
          
          if (pageItem.rotation && pageItem.rotation !== 0) {
            copiedPage.setRotation(degrees(pageItem.rotation));
          }
          outputPdf.addPage(copiedPage);

          // update progress
          const currentProgress = Math.min(95, Math.floor(10 + ((i + 1) / totalPagesToCompile) * 80));
          setState(prev => ({ ...prev, progress: currentProgress }));
        }

        const compiledBytes = await outputPdf.save();
        const blob = new Blob([compiledBytes], { type: "application/pdf" });
        const fileName = `Organized_${file.name}`;
        const downloadUrl = URL.createObjectURL(blob);

        // Download directly in browser
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setState({
          status: "completed",
          progress: 100,
          error: null,
          outputName: fileName,
          outputUrl: downloadUrl,
          outputSize: blob.size,
        });

        const historyLog: HistoryRecord = {
          id: Math.random().toString(36).substring(7),
          toolId: tool.id,
          fileName: file.name,
          fileSize: file.size,
          outputName: fileName,
          outputSize: blob.size,
          status: "success",
          processedAt: new Date().toISOString(),
        };
        addToHistory(historyLog);
        return;
      } catch (err: any) {
        console.error("[CLIENT-SIDE ORGANIZE ERROR]", err);
        const errorMsg = sanitizeErrorMessage(err.message || "An error occurred during client-side organization.");
        setState({
          status: "failed",
          progress: 0,
          error: errorMsg,
          outputName: null,
          outputUrl: null,
          outputSize: null,
        });

        const historyLog: HistoryRecord = {
          id: Math.random().toString(36).substring(7),
          toolId: tool.id,
          fileName: files[0].name,
          fileSize: files[0].size,
          status: "failed",
          processedAt: new Date().toISOString(),
          errorMessage: errorMsg,
        };
        addToHistory(historyLog);
        return;
      }
    }

    if (isAiStudioPreview && tool.id === "sign-pdf") {
      console.log("Running in Browser Mode - Sign PDF");
      
      setState({
        status: "processing",
        progress: 10,
        error: null,
        outputName: null,
        outputUrl: null,
        outputSize: null,
      });

      try {
        const file = files[0];
        const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (reader.result instanceof ArrayBuffer) {
              resolve(reader.result);
            } else {
              reject(new Error(`Failed to read file "${file.name}"`));
            }
          };
          reader.onerror = () => reject(new Error(`Failed to read file "${file.name}"`));
          reader.readAsArrayBuffer(file);
        });

        let pdfDoc;
        try {
          pdfDoc = await PDFDocument.load(arrayBuffer, {
            password: options.password
          } as any);
        } catch (loadErr: any) {
          pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true } as any);
        }

        const stamps = options.stamps || [];
        const totalStamps = stamps.length;

        for (let i = 0; i < totalStamps; i++) {
          const stamp = stamps[i];
          
          // Decode Base64 dataurl to uint8array bytes
          const base64Data = stamp.dataUrl.split(",")[1];
          const rawData = atob(base64Data);
          const rawLength = rawData.length;
          const imageBytes = new Uint8Array(new ArrayBuffer(rawLength));
          for (let idx = 0; idx < rawLength; idx++) {
            imageBytes[idx] = rawData.charCodeAt(idx);
          }

          // Embed as PNG
          const embeddedImage = await pdfDoc.embedPng(imageBytes);

          // Get destination page (0-based)
          const targetPageIndex = stamp.page - 1;
          const pages = pdfDoc.getPages();
          
          if (targetPageIndex >= 0 && targetPageIndex < pages.length) {
            const page = pages[targetPageIndex];
            const pageWidth = page.getWidth();
            const pageHeight = page.getHeight();

            // Sizing and placement calculations
            const pdfWidth = (stamp.width / 100) * pageWidth;
            const pdfHeight = (stamp.height / 100) * pageHeight;
            const pdfX = (stamp.x / 100) * pageWidth;
            const pdfY = ((100 - stamp.y - stamp.height) / 100) * pageHeight;

            // Draw stamp
            page.drawImage(embeddedImage, {
              x: pdfX,
              y: pdfY,
              width: pdfWidth,
              height: pdfHeight,
              rotate: degrees(stamp.rotation || 0),
            });
          }

          // update progress
          const currentProgress = Math.min(95, Math.floor(10 + ((i + 1) / totalStamps) * 80));
          setState(prev => ({ ...prev, progress: currentProgress }));
        }

        const signedBytes = await pdfDoc.save();
        const blob = new Blob([signedBytes], { type: "application/pdf" });
        const fileName = `Signed_${file.name}`;
        const downloadUrl = URL.createObjectURL(blob);

        // Download directly in browser
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setState({
          status: "completed",
          progress: 100,
          error: null,
          outputName: fileName,
          outputUrl: downloadUrl,
          outputSize: blob.size,
        });

        const historyLog: HistoryRecord = {
          id: Math.random().toString(36).substring(7),
          toolId: tool.id,
          fileName: file.name,
          fileSize: file.size,
          outputName: fileName,
          outputSize: blob.size,
          status: "success",
          processedAt: new Date().toISOString(),
        };
        addToHistory(historyLog);
        return;
      } catch (err: any) {
        console.error("[CLIENT-SIDE SIGN ERROR]", err);
        const errorMsg = sanitizeErrorMessage(err.message || "An error occurred during client-side signing.");
        setState({
          status: "failed",
          progress: 0,
          error: errorMsg,
          outputName: null,
          outputUrl: null,
          outputSize: null,
        });

        const historyLog: HistoryRecord = {
          id: Math.random().toString(36).substring(7),
          toolId: tool.id,
          fileName: files[0].name,
          fileSize: files[0].size,
          status: "failed",
          processedAt: new Date().toISOString(),
          errorMessage: errorMsg,
        };
        addToHistory(historyLog);
        return;
      }
    }

    if (isAiStudioPreview && tool.id === "split-pdf") {
      console.log("Running in Browser Mode - Split PDF");
      
      setState({
        status: "processing",
        progress: 10,
        error: null,
        outputName: null,
        outputUrl: null,
        outputSize: null,
      });

      try {
        const file = files[0];
        const splitMode = options.splitMode || "all";
        
        const result = await executeSplit(
          file,
          splitMode,
          {
            ranges: options.ranges,
            selectedPages: options.selectedPages,
            everyN: options.everyN ? parseInt(options.everyN, 10) : undefined,
          },
          (progress) => {
            setState(prev => ({ ...prev, progress }));
          }
        );

        const downloadUrl = URL.createObjectURL(result.blob);

        // Download directly in browser
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = result.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setState({
          status: "completed",
          progress: 100,
          error: null,
          outputName: result.fileName,
          outputUrl: downloadUrl,
          outputSize: result.size,
        });

        const historyLog: HistoryRecord = {
          id: Math.random().toString(36).substring(7),
          toolId: tool.id,
          fileName: file.name,
          fileSize: file.size,
          outputName: result.fileName,
          outputSize: result.size,
          status: "success",
          processedAt: new Date().toISOString(),
        };
        addToHistory(historyLog);
        return;
      } catch (err: any) {
        console.error("[CLIENT-SIDE SPLIT ERROR]", err);
        const errorMsg = sanitizeErrorMessage(err.message || "An error occurred during client-side split.");
        setState({
          status: "failed",
          progress: 0,
          error: errorMsg,
          outputName: null,
          outputUrl: null,
          outputSize: null,
        });

        const historyLog: HistoryRecord = {
          id: Math.random().toString(36).substring(7),
          toolId: tool.id,
          fileName: files[0].name,
          fileSize: files[0].size,
          status: "failed",
          processedAt: new Date().toISOString(),
          errorMessage: errorMsg,
        };
        addToHistory(historyLog);
        return;
      }
    }

    // 2. Set Uploading State
    setState({
      status: "uploading",
      progress: 10,
      error: null,
      outputName: null,
      outputUrl: null,
      outputSize: null,
    });

    try {
      // Create FormData to send files to Express backend
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      formData.append("toolId", tool.id);
      formData.append("options", JSON.stringify(options));

      // Simulate uploading progress tick
      const uploadInterval = setInterval(() => {
        setState((prev) => {
          if (prev.status === "uploading" && prev.progress < 90) {
            return { ...prev, progress: prev.progress + 15 };
          }
          clearInterval(uploadInterval);
          return prev;
        });
      }, 150);

      // Perform real handshake request to backend
      console.log(`[HANDSHAKE] Requesting PDF process for tool: "${tool.id}" with ${files.length} files...`);
      const response = await fetch("/api/process-document", {
        method: "POST",
        body: formData,
      });

      clearInterval(uploadInterval);

      console.group('PDF Fetch Lifecycle');
      const contentType = response.headers.get("content-type") || "";
      console.log(`Response Status: ${response.status}`);
      console.log(`Content-Type: ${contentType}`);
      console.log("Headers:");
      response.headers.forEach((value, key) => {
        console.log(`  ${key}: ${value}`);
      });
      console.groupEnd();

      // 1. Detect HTML early to prevent invalid JSON parse attempt
      if (contentType.includes("text/html")) {
        const htmlText = await response.text();
        console.error("[ERROR] Received HTML response from server:", htmlText);
        throw new Error("Server configuration error. API returned HTML instead of JSON.");
      }

      // 2. Handle HTTP Errors safely
      if (!response.ok) {
        if (contentType.includes("application/json")) {
          const errData = await response.json().catch(() => ({}));
          console.error("[ERROR] Server returned API error:", errData);
          throw new Error(errData.message || `Server error during processing: status ${response.status}`);
        } else {
          const text = await response.text().catch(() => "");
          console.error("[ERROR] Server returned non-JSON error status:", response.status, text);
          throw new Error(`Server error during processing: status ${response.status}. ${text.substring(0, 100)}`);
        }
      }

      // 3. Set Processing State
      setState({
        status: "processing",
        progress: 50,
        error: null,
        outputName: null,
        outputUrl: null,
        outputSize: null,
      });

      const processingInterval = setInterval(() => {
        setState((prev) => {
          if (prev.status === "processing" && prev.progress < 95) {
            return { ...prev, progress: prev.progress + 10 };
          }
          clearInterval(processingInterval);
          return prev;
        });
      }, 200);

      // 4. Handle Content Types (PDF vs JSON)
      let result;
      if (contentType.includes("application/pdf")) {
        console.log("[SUCCESS] Received direct PDF stream from processing endpoint.");
        const blob = await response.blob();
        clearInterval(processingInterval);

        const fileName = files.length > 1 ? "Merged_Document.pdf" : files[0].name;
        const downloadUrl = URL.createObjectURL(blob);

        // Auto trigger download
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setState({
          status: "completed",
          progress: 100,
          error: null,
          outputName: fileName,
          outputUrl: downloadUrl,
          outputSize: blob.size,
        });

        const historyLog: HistoryRecord = {
          id: Math.random().toString(36).substring(7),
          toolId: tool.id,
          fileName: files.map(f => f.name).join(", "),
          fileSize: files.reduce((sum, f) => sum + f.size, 0),
          outputName: fileName,
          outputSize: blob.size,
          status: "success",
          processedAt: new Date().toISOString(),
        };
        addToHistory(historyLog);
        return;
      } else if (contentType.includes("application/json")) {
        result = await response.json();
        console.log("[SUCCESS] Received processing JSON result:", result);
      } else {
        const text = await response.text().catch(() => "");
        if (text.trim().startsWith("<!doctype") || text.trim().startsWith("<html")) {
          throw new Error("Server configuration error. API returned HTML instead of JSON.");
        }
        throw new Error(`Unexpected server response of format: "${contentType}"`);
      }

      clearInterval(processingInterval);

      // 5. Success Completion State (from JSON result response)
      setState({
        status: "completed",
        progress: 100,
        error: null,
        outputName: result.outputName,
        outputUrl: result.outputUrl || "#",
        outputSize: result.outputSize,
      });

      // Write to storage log history
      const historyLog: HistoryRecord = {
        id: result.jobId || Math.random().toString(36).substring(7),
        toolId: tool.id,
        fileName: files.map(f => f.name).join(", "),
        fileSize: files.reduce((sum, f) => sum + f.size, 0),
        outputName: result.outputName,
        outputSize: result.outputSize,
        status: "success",
        processedAt: new Date().toISOString(),
      };
      addToHistory(historyLog);

    } catch (err: any) {
      const errorMsg = sanitizeErrorMessage(err.message || "An unexpected error occurred while processing.");
      setState({
        status: "failed",
        progress: 0,
        error: errorMsg,
        outputName: null,
        outputUrl: null,
        outputSize: null,
      });

      // Log failure in history
      const historyLog: HistoryRecord = {
        id: Math.random().toString(36).substring(7),
        toolId: tool.id,
        fileName: files.map(f => f.name).join(", "),
        fileSize: files.reduce((sum, f) => sum + f.size, 0),
        status: "failed",
        processedAt: new Date().toISOString(),
        errorMessage: errorMsg,
      };
      addToHistory(historyLog);
    }
  }, [addToHistory]);

  return {
    state,
    processFiles,
    resetState,
    history,
  };
}
