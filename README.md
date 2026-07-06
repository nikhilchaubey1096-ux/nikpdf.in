# NikPDF Solutions & Intelligence Core

NikPDF is a comprehensive full-stack platform modeled after iLovePDF and SmallPDF. It combines client-side lightning fast PDF processing engines with advanced server-side AI scanned analytics.

---

## 🛠️ Tech Stack & Library Frameworks

### 1. Frontend
* **Vite + React (v19)**: Fluid responsive client layout.
* **Tailwind CSS (v4)**: High-contrast aesthetic featuring glassy controls and smooth animations.
* **Lucide React**: Clean unified vector iconography.
* **pdf-lib**: In-memory compilation of mergers, splits, watermarks, and page rotation/trim tasks.
* **jsPDF**: Generation and scale optimization of image layers into PDFs (JPG to PDF).

### 2. Backend API
* **Node.js + Express**: Scalable API endpoints.
* **GoogleGenAI (@google/genai SDK)**: Performs advanced multi-page Gemini OCR scans and handles conversational chat regarding PDF layouts via the `gemini-3.5-flash` model.
* **Multer**: High-speed memory storage layer for document buffer uploads.
* **JSON Reactive DB**: Local self-contained JSON file database that auto-composts logs and reads. Runs right out of the box in container preview with zero external dependencies needed!

---

## 📂 Code Directory Overview

```text
/
├── server.ts                    # Main Express server and API coordinator
├── package.json                 # Core dependencies mapping
├── metadata.json                # Project identification configuration
├── src/
│   ├── App.tsx                  # Landing hero panel & route coordinator
│   ├── types.ts                 # Shared schemas and data configurations
│   ├── index.css                # Tailwind import and global typography theme
│   └── components/
│       ├── Navbar.tsx           # Navigation controller with plan meters
│       ├── Footer.tsx           # Footer navigational anchors
│       ├── PdfToolsProcessor.tsx # ALL 12 PDF tools interactive dashboards
│       ├── UserDashboard.tsx    # Live usage count meters and processed logs
│       ├── AdminPanel.tsx       # Live charts, user settings, configurations
│       ├── PricingModal.tsx     # Plan card tables and Razorpay simulated gateway
│       ├── AboutContact.tsx     # Integrated support system with dynamic ticket creation
│       ├── PrivacyTerms.tsx     # Corporate legal policies
│       └── Blog.tsx             # Curated PDF tech tutorials
```

---

## 🔐 Environment Settings (`.env.example`)

Before deploying or launching in production mode, populate your variables:

```bash
# Obtain your API keys via AI Studio Secrets Panel
GEMINI_API_KEY="YOUR_ACTUAL_GEMINI_KEY"

# Backend server address
APP_URL="https://your-custom-domain.com"
```

---

## 🚀 Deployment Instructions

### Option A: Serverless Deployment (Self-contained CJS bundle)
We have optimized compiling via our custom `npm run build` command:
1. It builds client-side production files under `dist/`.
2. It bundles `server.ts` into a self-contained ES module safe file (`dist/server.cjs`) using `esbuild`.
3. You can deploy the entire workspace directly on **Google Cloud Run**, **Render**, or **Railway** with:
   * Build Command: `npm run build`
   * Start Command: `npm run start`

### Option B: Split Frontend / Backend
* **Frontend**: Upload files to **Vercel** or **Netlify**. Set output directory parameter to `dist`.
* **Backend**: Deploy `server.ts` onto **Render.com**. Ensure you register `GEMINI_API_KEY` in Render's Env secrets panel!
