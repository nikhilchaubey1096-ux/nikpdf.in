import express from "express";
import compression from "compression";
import path from "path";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import { createServer as createViteServer } from "vite";
import { uploadGuard } from "./server/middleware/upload.js";
import { DocumentService } from "./server/services/document.service.js";

dotenv.config();

const app = express();
const PORT = 3000;

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// 1. HTTPS Enforcement Middleware for Production
app.use((req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    const proto = req.headers["x-forwarded-proto"];
    if (proto && proto !== "https") {
      return res.redirect(301, `https://${req.get("host")}${req.originalUrl}`);
    }
  }
  next();
});

// 2. Global API Request & Performance Logging Middleware
app.use((req, res, next) => {
  const startTime = process.hrtime();
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || req.ip;
  const userAgent = req.headers["user-agent"] || "unknown";

  res.on("finish", () => {
    const diff = process.hrtime(startTime);
    const durationMs = (diff[0] * 1000 + diff[1] / 1000000).toFixed(2);
    const memUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
    
    // API request logging + Performance monitoring combined
    console.log(`[MONITOR] [API REQUEST] - IP: ${clientIp} - Method: ${req.method} - URL: ${req.originalUrl} - Status: ${res.statusCode} - Duration: ${durationMs}ms - RSS Memory: ${memUsage}MB - UA: ${userAgent}`);
  });

  next();
});

// Minimal healthy API route
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "NikPDF V2 Backend initialized and clean." });
});

// Unified Document Processing Endpoint (Shared Framework)
app.post("/api/process-document", uploadGuard.array("files"), async (req, res, next) => {
  const startTime = process.hrtime();
  const files = (req.files as Express.Multer.File[]) || [];
  const { toolId, options } = req.body;
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || req.ip;

  // Failed upload logging
  if (!files || files.length === 0) {
    console.error(`[MONITOR] [FAILED UPLOAD] - Tool: "${toolId}" - Reason: No files received - IP: ${clientIp}`);
  }

  try {
    let parsedOptions = {};
    if (options) {
      try {
        parsedOptions = JSON.parse(options);
      } catch {
        parsedOptions = {};
      }
    }

    const result = await DocumentService.process(files, toolId, parsedOptions);

    // Performance Monitoring for successful run
    const diff = process.hrtime(startTime);
    const durationMs = (diff[0] * 1000 + diff[1] / 1000000).toFixed(2);
    const memUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
    console.log(`[MONITOR] [PERFORMANCE] - Tool: "${toolId}" - Files: ${files.length} - Processing Duration: ${durationMs}ms - RSS Memory: ${memUsage}MB`);

    res.json(result);
  } catch (err: any) {
    // Failed conversion logging
    const fileMetadata = files.map(f => ({ name: f.originalname, size: f.size, mime: f.mimetype }));
    console.error(`[MONITOR] [FAILED CONVERSION] - Tool: "${toolId}" - Error: "${err.message}" - Input Files: ${JSON.stringify(fileMetadata)} - IP: ${clientIp} - Stack: ${err.stack}`);

    res.status(400).json({
      success: false,
      error: err.message || "An error occurred during document processing.",
      message: err.message || "An error occurred during document processing.",
    });
  }
});

// Mock Download stream endpoint matching standard output links
app.get("/api/download/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = DocumentService.getJob(jobId);
  
  if (!job) {
    return res.status(404).json({
      success: false,
      error: "Download link expired or invalid. Please try running the tool again.",
      message: "Download link expired or invalid. Please try running the tool again.",
    });
  }
  
  // Set headers to trigger real attachment download
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(job.outputName)}"`);
  res.setHeader("Content-Type", job.mimeType);
  res.send(job.buffer);
});

// Fallback 404 handler for any unregistered /api/* routes to prevent returning HTML
app.all("/api/*", (req, res) => {
  res.status(404).json({
    success: false,
    error: `API route ${req.method} ${req.path} not found.`,
    message: `API route ${req.method} ${req.path} not found.`,
  });
});

// Global error-handling middleware to prevent HTML leak for crashes/limit exceptions (Global error logging)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || req.ip;
  console.error(`[MONITOR] [GLOBAL ERROR] - IP: ${clientIp} - Path: ${req.originalUrl} - Method: ${req.method} - Error: "${err.message}" - Stack: ${err.stack}`);
  
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    error: err.message || "An unexpected server error occurred.",
    message: err.message || "An unexpected server error occurred.",
  });
});


async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    
    // Enable Static Cache with custom Cache-Control headers
    app.use(express.static(distPath, {
      maxAge: "30d", // Static assets cached for 30 days in user-browsers
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
          // Do not cache HTML files so clients always receive updates
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        } else {
          // Cache fonts, assets, and builds with immutable settings
          res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
        }
      }
    }));
    
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
