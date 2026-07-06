import { ToolDef, ValidationResult } from "../types";

/**
 * Validates an array of files against a Tool Definition's constraints.
 */
export function validateFiles(files: File[], tool: ToolDef): ValidationResult {
  if (files.length === 0) {
    return { isValid: false, error: "Please select at least one file." };
  }

  // Certain tools support multiple files, others only support a single file.
  const supportsMultiple = tool.id === "merge-pdf" || tool.id === "jpg-to-pdf";
  if (!supportsMultiple && files.length > 1) {
    return { isValid: false, error: "This tool only supports processing a single file at a time." };
  }

  for (const file of files) {
    // 1. Validate size
    const sizeInMB = file.size / (1024 * 1024);
    if (sizeInMB > tool.maxSizeMB) {
      return {
        isValid: false,
        error: `File "${file.name}" exceeds the maximum limit of ${tool.maxSizeMB}MB for this tool.`,
      };
    }

    // 2. Validate MIME type or file extension
    const fileExtension = file.name.split(".").pop()?.toLowerCase();
    const isPdf = file.type === "application/pdf" || fileExtension === "pdf";
    const isDoc = file.type === "application/msword" || fileExtension === "doc";
    const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || fileExtension === "docx";
    const isRtf = file.type === "application/rtf" || file.type === "text/rtf" || fileExtension === "rtf";
    const isOdt = file.type === "application/vnd.oasis.opendocument.text" || fileExtension === "odt";
    const isJpg = file.type === "image/jpeg" || fileExtension === "jpg" || fileExtension === "jpeg";
    const isPng = file.type === "image/png" || fileExtension === "png";
    const isWebp = file.type === "image/webp" || fileExtension === "webp";
    const isBmp = file.type === "image/bmp" || fileExtension === "bmp";
    const isTiff = file.type === "image/tiff" || fileExtension === "tiff" || fileExtension === "tif";
    const isHeic = file.type === "image/heic" || file.type === "image/heif" || fileExtension === "heic" || fileExtension === "heif";

    let matchesMime = false;
    for (const allowed of tool.allowedMimeTypes) {
      if (allowed === "application/pdf" && isPdf) matchesMime = true;
      if (allowed === "application/msword" && isDoc) matchesMime = true;
      if (allowed === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && isDocx) matchesMime = true;
      if (allowed === "application/rtf" && isRtf) matchesMime = true;
      if (allowed === "text/rtf" && isRtf) matchesMime = true;
      if (allowed === "application/vnd.oasis.opendocument.text" && isOdt) matchesMime = true;
      if (allowed === "image/jpeg" && isJpg) matchesMime = true;
      if (allowed === "image/png" && isPng) matchesMime = true;
      if (allowed === "image/webp" && isWebp) matchesMime = true;
      if (allowed === "image/bmp" && isBmp) matchesMime = true;
      if (allowed === "image/tiff" && isTiff) matchesMime = true;
      if (allowed === "image/heic" && isHeic) matchesMime = true;
      if (allowed === "image/heif" && isHeic) matchesMime = true;
    }

    if (!matchesMime) {
      const extensionList = tool.allowedMimeTypes.map(mime => {
        if (mime.includes("pdf")) return ".pdf";
        if (mime.includes("wordprocessingml")) return ".docx";
        if (mime.includes("msword")) return ".doc";
        if (mime.includes("rtf")) return ".rtf";
        if (mime.includes("opendocument.text")) return ".odt";
        if (mime.includes("jpeg")) return ".jpg/.jpeg";
        if (mime.includes("png")) return ".png";
        if (mime.includes("webp")) return ".webp";
        if (mime.includes("bmp")) return ".bmp";
        if (mime.includes("tiff")) return ".tiff";
        if (mime.includes("heic")) return ".heic";
        if (mime.includes("heif")) return ".heif";
        return mime;
      }).join(", ");

      return {
        isValid: false,
        error: `Invalid file format for "${file.name}". This tool only accepts ${extensionList} files.`,
      };
    }
  }

  return { isValid: true, error: null };
}
