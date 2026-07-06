# NIKPDF V2: MASTER ARCHITECTURAL SPECIFICATION & BLUEPRINT
Version: 2.0.0-PROD
Status: Proposed / Architectural Framework Design

This document outlines the complete production-grade architecture, folder structure, routing strategy, database models, payment pipelines, and multi-stage implementation roadmap for **NikPDF V2**.

---

## 1. EXECUTIVE SYSTEM ARCHITECTURE

NikPDF V2 is designed using a **Clean Architecture** paradigm, decoupling the presentation layer from business logic and database drivers. The system operates on a full-stack Node.js (Express) + React 19 (Vite) setup, utilizing a dual-engine architecture for processing PDF operations: lightweight client-side execution for zero-latency operations, and highly optimized server-side Python / Node workers for deep document manipulation, OCR, and AI insights.

### 1.1 Logical Flow Architecture Diagram

```text
                                  +---------------------------------------+
                                  |         User Browser / Client         |
                                  |  (React 19 + Tailwind CSS + Vite)    |
                                  +-------------------+-------------------+
                                                      |
                                                      | HTTPS (CORS, Helmet Protected)
                                                      v
                                  +-------------------+-------------------+
                                  |         Nginx Reverse Proxy           |
                                  |      (Rate Limiting & SSL Term)       |
                                  +-------------------+-------------------+
                                                      |
                                                      v
                                  +-------------------+-------------------+
                                  |       Express.js API Gateway          |
                                  |    (JWT, Auth, Rate Limiters)         |
                                  +----+--------------+--------------+----+
                                       |              |              |
         +-----------------------------+              |              +-----------------------------+
         | Internal Service Call                      | API Request                                | RPC / Process Spawn
         v                                            v                                            v
+--------+--------------------+              +--------+--------------------+              +--------+--------------------+
|     AI & Gemini Engine      |              |   Storage Service Layer     |              |   Python Document Engine    |
| (Google GenAI 3.5 Flash)    |              | (Local Disk / AWS S3/GCS)   |              |  (pdf2docx, camelot, OCR)   |
+--------+--------------------+              +--------+--------------------+              +--------+--------------------+
         |                                            |                                            |
         | Read/Write Metadata                        v Write Temp Files                           | Read/Write Documents
         v                                   +--------+--------------------+                       v
+--------+--------------------+              |   Shared Cache / Filesystem |              +--------+--------------------+
|   Database Layer (MongoDB)  | <----------+ |   (Temporary Volume Mount)  | <----------+ |     Temporary File System   |
|   (Mongoose Schemas)        |              +-----------------------------+              +-----------------------------+
+-----------------------------+
```

---

## 2. PRODUCTION DIRECTORY & FOLDER STRUCTURE

The system codebase is divided into separate backend, frontend, and shared workspaces. This ensures maximum separation of concerns, simplifies horizontal scaling, and enables rapid microservice migration.

```text
nikpdf-v2/
├── .env.example                    # Comprehensive environment template
├── .gitignore                      # Git exclusion patterns
├── Dockerfile                      # Production multi-stage Docker build config
├── docker-compose.yml              # Dev multi-container orchestrator
├── package.json                    # Workspace orchestrator and dependency list
├── README.md                       # Project landing document
├── tsconfig.json                   # Root TypeScript compilation rules
├── vite.config.ts                  # Vite build tool and dev-server configuration
├── shared/                         # SHARED WORKSPACE (Compile-Safe Types & Schemas)
│   └── types/
│       ├── index.ts                # Entry point exporting all shared types
│       ├── auth.types.ts           # Token, user, and authorization state payloads
│       ├── document.types.ts       # File upload metadata, history, and status
│       ├── payment.types.ts        # Order, subscription, and invoice state payloads
│       └── admin.types.ts          # Feedback, analytics metrics, and system setting schemas
│
├── server/                         # BACKEND SYSTEM (Node.js + Express + TS)
│   ├── server.ts                   # Express server entry point & middleware router
│   ├── config/
│   │   ├── db.ts                   # MongoDB Mongoose connection coordinator
│   │   ├── passport.ts             # Google OAuth2 strategies configuration
│   │   └── index.ts                # Application configuration loader
│   ├── controllers/
│   │   ├── auth.controller.ts      # Auth flows (Register, Login, Refresh, Password)
│   │   ├── user.controller.ts      # Profile, custom configurations, and history
│   │   ├── document.controller.ts  # Document operations, history logs, metadata
│   │   ├── payment.controller.ts   # Razorpay payments, subscriptions, and webhooks
│   │   └── admin.controller.ts     # System settings, dashboards, audit trails, and feedbacks
│   ├── middleware/
│   │   ├── auth.middleware.ts      # JWT validation, Admin authorization
│   │   ├── error.middleware.ts     # Global centralized Express error handler
│   │   ├── limit.middleware.ts     # IP and User-based rate limiters (DDOS protection)
│   │   ├── upload.middleware.ts    # Multer disk/memory upload guards
│   │   └── security.middleware.ts  # Helmet, CORS configurations, sanitize validation
│   ├── models/
│   │   ├── User.ts                 # User Schema (Mongoose)
│   │   ├── RefreshToken.ts         # Encrypted Refresh Token Rotations Schema
│   │   ├── History.ts              # PDF Processing Log / History Schema
│   │   ├── Subscription.ts         # Subscription Plans details Schema
│   │   ├── Transaction.ts          # Razorpay Payment & Order Audit Log Schema
│   │   ├── SupportTicket.ts        # Customer Feedbacks & Support Tickets Schema
│   │   └── SystemSetting.ts        # Dynamic Admin Controls Schema
│   ├── routes/
│   │   ├── auth.routes.ts          # Auth routes mount point (/api/v2/auth)
│   │   ├── user.routes.ts          # User preferences & history (/api/v2/user)
│   │   ├── document.routes.ts      # PDF/Document tools (/api/v2/pdf)
│   │   ├── payment.routes.ts       # Payment gateway callbacks (/api/v2/payment)
│   │   └── admin.routes.ts         # System configurations (/api/v2/admin)
│   ├── services/
│   │   ├── ai.service.ts           # Google GenAI (Gemini) SDK client wrapper
│   │   ├── storage.service.ts      # Local disk / AWS S3/GCS Unified Interface
│   │   └── mail.service.ts         # Transporter for verification & reset emails
│   ├── utils/
│   │   ├── logger.ts               # Winston-based production logger (levels, transports)
│   │   └── pdf.ts                  # Subprocess wrappers calling python-service & libreoffice
│   └── workers/
│       └── pdf_worker.ts           # Heavy background job queue listeners
│
├── python-service/                 # DEDICATED DOCUMENT ENGINE (Flask / FastAPI)
│   ├── app.py                      # REST entry point mapping python processors
│   ├── requirements.txt            # Python dependencies (pdf2docx, camelot, openpyxl, pymupdf)
│   └── processors/
│       ├── word_converter.py       # High-fidelity pdf2docx parser
│       ├── excel_converter.py      # Camelot / Openpyxl tabular data extractor
│       └── ocr_scanner.py          # PyMuPDF + Tesseract-OCR text pipeline
│
└── src/                            # FRONTEND SYSTEM (React 19 + TS + Vite)
    ├── main.tsx                    # Client bootloader
    ├── App.tsx                     # Core Client routing coordinator
    ├── index.css                   # Global CSS imports with Tailwind CSS @import
    ├── config/
    │   └── queryClient.ts          # TanStack Query standard caching configs
    ├── context/
    │   └── AuthContext.tsx         # Unified authentication state provider
    ├── hooks/
    │   ├── useAuth.ts              # Hook to read auth state, logins, logout, and register
    │   ├── useDocuments.ts         # TanStack Query mutations for file processing
    │   └── usePayment.ts           # Razorpay SDK initialization & processing triggers
    ├── lib/
    │   ├── api.ts                  # Axios interceptor setting Bearer tokens and handles 401 refresh
    │   ├── analytics.ts            # GA4 tracking triggers
    │   └── utils.ts                # Class merger helper (cn)
    ├── pages/
    │   ├── Home.tsx                # General homepage showing pricing, trust indicators, features
    │   ├── Dashboard.tsx           # User area with processed logs, active plans, usage meters
    │   ├── Admin.tsx               # Analytics charts, feedback management, setting toggles
    │   ├── ToolsDirectory.tsx      # All tools categorized list page
    │   ├── ToolProcessorPage.tsx   # Standard wrapper UI providing file uploads, statuses, and downloads
    │   ├── Blog.tsx                # Technical tutorials page
    │   ├── AboutContact.tsx        # Support & company mission page
    │   └── PrivacyTerms.tsx        # Corporate security compliance terms
    └── components/
        ├── common/                 # REUSABLE PRESENTATIONAL UI
        │   ├── Button.tsx          # Consistent premium buttons
        │   ├── Card.tsx            # Standard layout containers
        │   ├── Modal.tsx           # Overlay components with Framer Motion
        │   └── UploadArea.tsx      # Drag-and-drop file uploader (Mobile targets optimized)
        ├── layout/
        │   ├── Navbar.tsx          # Dynamic responsive header
        │   └── Footer.tsx          # Navigational links footer
        └── dashboard/
            ├── UsageMeter.tsx      # SVG-based dynamic limit speedometer
            └── HistoryTable.tsx    # Processing logs table with retry/download/share hooks
```

---

## 3. DATABASE SCHEMA DESIGN (MONGOOSE & MONGODB)

The MongoDB collection schema is meticulously designed to support relational-style consistency via Mongoose validation, proper indexes for high-frequency user/history queries, and sub-second analytics data retrieval.

### 3.1 `UserSchema`
Tracks user details, emails, verification indicators, and active subscription configurations.
```typescript
import { Schema, model } from 'mongoose';

const UserSchema = new Schema({
  email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  fullName: { type: String, required: true, trim: true },
  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String },
  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date },
  plan: { type: String, enum: ['free', 'pro', 'business', 'premium'], default: 'free', index: true },
  dailyUsageCount: { type: Number, default: 0 },
  maxFilesLimit: { type: Number, default: 5 },
  maxSizeLimit: { type: Number, default: 10 }, // MB
  subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

UserSchema.index({ email: 1, plan: 1 });
```

### 3.2 `RefreshTokenSchema`
Stores active session refresh hashes. Supports refresh token rotation (RTR) to invalidate entire login sessions upon detect of replay attacks.
```typescript
const RefreshTokenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expires: '30d' } }, // Self-purges expired logs
  revoked: { type: Boolean, default: false }
}, { timestamps: true });
```

### 3.3 `HistorySchema`
Maintains operational audit records of document processing.
```typescript
const HistorySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true, required: false }, // optional for guest users
  ipAddress: { type: String, required: true },
  toolType: { type: String, required: true, index: true },
  fileName: { type: String, required: true },
  fileSize: { type: Number, required: true },
  outputName: { type: String, required: true },
  outputSize: { type: Number },
  status: { type: String, enum: ['success', 'failed'], required: true, index: true },
  errorMessage: { type: String },
  processedAt: { type: Date, default: Date.now }
}, { timestamps: true });
```

### 3.4 `TransactionSchema`
Tracks order state and webhook synchronization details for billing.
```typescript
const TransactionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  orderId: { type: String, required: true, unique: true },
  paymentId: { type: String },
  signature: { type: String },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  planSelected: { type: String, enum: ['pro', 'business', 'premium'], required: true },
  status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created', index: true },
  billingCycle: { type: String, enum: ['monthly', 'yearly'], required: true }
}, { timestamps: true });
```

---

## 4. AUTHENTICATION & SECURITY STRATEGY

To ensure a robust, security-hardened SaaS platform, we implement the **Refresh Token Rotation (RTR)** mechanism combined with short-lived, in-memory Access Tokens.

### 4.1 Client-Side Token Cycle
1. **Access Tokens**: Short-lived (15 minutes). Exchanged and stored strictly in **application memory** (React state). Never written to `localStorage` or `sessionStorage` to mitigate Cross-Site Scripting (XSS) extraction.
2. **Refresh Tokens**: Long-lived (30 days). Stored in a secure, partitioned, server-managed cookie:
   - `httpOnly`: Prevents JavaScript execution scripts from accessing the cookie.
   - `Secure`: Transmitted strictly over HTTPS channels.
   - `SameSite=Strict`: Shields against Cross-Site Request Forgery (CSRF).
   - `Path=/api/v2/auth/refresh`: Cookie is sent *only* on refresh route requests, saving network bandwidth on file uploads.

### 4.2 Security Guards
* **Helmet.js**: Implements Content Security Policy (CSP), HTTP Strict Transport Security (HSTS), X-Content-Type-Options (preventing MIME sniffing), and X-Frame-Options (preventing Clickjacking).
* **CORS Guard**: Strict validation whitelist. Only certified dashboard URLs are permitted access.
* **Rate Limiting Middleware**:
  - General API: Max 100 requests / 15 mins per IP.
  - Processing Endpoints: Limit checks adjusted based on tier limits (e.g., Free users limited to 5 processes/day).
  - Auth Routes: Max 5 login attempts / 5 mins per IP to stop Brute-Force operations.

---

## 5. DOCUMENT PROCESSING PIPELINES

Document processing pipelines are optimized to prevent server bottlenecks, memory exhaustion, and slow request timeouts.

```text
               +-------------------------------------------------------------+
               |                    Incoming File Upload                     |
               +------------------------------+------------------------------+
                                              |
                                              v
               +-------------------------------------------------------------+
               |                      Multer Upload Guard                    |
               |     (Validates Magic Bytes, Mimetypes, and Size Limits)      |
               +------------------------------+------------------------------+
                                              |
                                              v
               +-------------------------------------------------------------+
               |                  Storage Abstraction Layer                  |
               |                     (IStorageService)                       |
               +---------------+------------------------------+--------------+
                               |                              |
            Local Dev Path     v                              v Production Path
               +---------------+-------------+  +-------------+---------------+
               |    Local Temp Directory     |  |     Secure AWS S3 Bucket    |
               |      (Memory / Disk)        |  |   (Multipart direct stream) |
               +---------------+-------------+  +-------------+---------------+
                               |                              |
                               +--------------+---------------+
                                              |
                                              v
               +-------------------------------------------------------------+
               |                      Core processing                        |
               +-------+----------------------+-----------------------+------+
                       |                      |                       |
                       v Client-Side Path     v Server-Side Fast      v Background Queue
               +-------+-------------+ +------+--------------+ +------+--------------+
               | In-Memory Browser   | | Sync Service        | | Async Worker        |
               | (pdf-lib, jsPDF)    | | (qpdf, poppler-utils| | (Python Service,    |
               | e.g. Merge, Rotate  | | OCR scan, watermark)| | LibreOffice convert)|
               +---------------------+ +---------------------+ +---------------------+
```

### 5.1 Storage Abstraction (`IStorageService`)
Ensures full decouple of the core file operation.
```typescript
export interface IStorageService {
  saveFile(fileBuffer: Buffer, fileName: string): Promise<string>;
  getFileStream(fileKey: string): Promise<NodeJS.ReadableStream>;
  deleteFile(fileKey: string): Promise<void>;
}
```

### 5.2 Heavy Process Decoupling
To maintain continuous low API latency, the Express server communicates with the dedicated Python Service via secure TCP/HTTP loopback:
1. Express API receives a `.pdf` for Word conversion.
2. File metadata gets saved into MongoDB, file is committed to temporary secure disk paths.
3. Express calls the Python microservice route: `POST http://localhost:5000/convert-to-docx` passing file locations.
4. Python microservice executes the converter in a highly optimized C-level thread (`pdf2docx`).
5. Upon completion, Python returns success and output file location. Express serves the download attachment directly to the client and triggers local background cleanup of raw buffers.

---

## 6. BILLING, PAYMENTS, & SUBSCRIPTION LIFECYCLE (RAZORPAY)

Payments must be secure, verifiable, and highly resistant to network interruptions. We construct a multi-step signature confirmation system.

```text
User Selects Plan
      │
      ▼
Client Triggers Order Creation
      │
      ▼
Server calls Razorpay API ─────► [Razorpay Server] (Returns Order ID)
      │
      ▼
Client opens Razorpay Modal
      │
      ▼
User pays successfully
      │
      ▼
Client POSTs Razorpay Response ──► [Express API: /verify-payment]
(payment_id, order_id, signature)          │
                                           ├─► Validate signature using HMAC-SHA256
                                           │   with Razorpay Secret Key.
                                           │
                                           ├─► Success: Upgrade User tier in MongoDB
                                           │   & Commit Transaction Log.
                                           │
                                           └─► Fail: Audit logs and return security error.
```

### 6.1 Cryptographic Verification Sample
```typescript
import crypto from 'crypto';

export function verifySignature(orderId: string, paymentId: string, signature: string, secret: string): boolean {
  const text = `${orderId}|${paymentId}`;
  const generatedSignature = crypto
    .createHmac('sha256', secret)
    .update(text)
    .digest('hex');
  return generatedSignature === signature;
}
```

---

## 7. SHARED TYPING SYSTEM

TypeScript safety guarantees consistent interfaces across client and server. These type definitions live in `/shared/types/index.ts` and are imported natively.

```typescript
export interface UserDef {
  id: string;
  email: string;
  fullName: string;
  plan: 'free' | 'pro' | 'business' | 'premium';
  dailyUsageCount: number;
  maxFilesLimit: number;
  maxSizeLimit: number;
  createdAt: Date;
  isVerified: boolean;
  isAdmin?: boolean;
}

export interface DocumentHistoryLog {
  id: string;
  userId?: string;
  toolType: string;
  fileName: string;
  fileSize: number;
  outputName: string;
  status: 'success' | 'failed';
  processedAt: Date;
  errorMessage?: string;
}

export interface SubscriptionPlanDef {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  maxFilesPerDay: number;
  maxSizeMB: number;
  benefits: string[];
}

export interface SystemFeedbackDef {
  id: string;
  userId?: string;
  name: string;
  email: string;
  category: 'bug' | 'feature_request' | 'general';
  message: string;
  status: 'pending' | 'reviewing' | 'resolved';
  createdAt: Date;
}
```

---

## 8. PRODUCTION-READY CONFIGURATION

### 8.1 Docker Multi-Stage Optimization
To build light production layers and exclude development TypeScript packages.
```dockerfile
# Stage 1: Build Frontend assets
FROM node:20-alpine AS client-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Build Backend server and install dependencies
FROM node:20-alpine AS server-runner
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=client-builder /app/dist ./dist
COPY --from=client-builder /app/server ./server
COPY --from=client-builder /app/server.ts ./server.ts

# Install required tools (qpdf, poppler-utils, libreoffice)
RUN apk update && apk add --no-cache \
    qpdf \
    poppler-utils \
    libreoffice \
    python3 \
    py3-pip

EXPOSE 3000
CMD ["node", "dist/server.cjs"]
```

---

## 9. MULTI-STAGE ROADMAP & EXECUTION PLAN

```text
   PHASE 1                 PHASE 2                 PHASE 3                 PHASE 4                 PHASE 5                 PHASE 6
Foundation &            Auth & Database         Document Engine         Payment System          Admin & Analytics       Final Audit,
Core Setup                 Integration             Integration          Subscription Module        Dashboard             QA & Deploy
(Weeks 1-2)                (Weeks 3-4)             (Weeks 5-6)            (Weeks 7-8)             (Weeks 9-10)          (Weeks 11-12)
    │                          │                       │                       │                       │                      │
    ├─ Multi-stage Docker      ├─ JWT / Cookie auth    ├─ pdf-lib client core  ├─ Razorpay SDK config  ├─ Admin Panel         ├─ Cross-browser audit
    ├─ Linting & formatting    ├─ MongoDB index config ├─ Python pdf2docx integration ├─ Cryptographic Webhooks  ├─ Feedbacks status    ├─ Stress tests load
    └─ Shared Types schemas    └─ Passport OAuth state └─ S3 storage service abstraction └─ Subscription tiers enforcement └─ Charting engine setup └─ Production deployment
```

### Phase 1: Foundation & Core Setup (Est. 2 Weeks)
* Initialize project structure, TypeScript config adjustments, and package dependencies audits.
* Build strict linting rules and verify formatting configurations (`eslint.config.js`).
* Create `/shared/types` structures and verify client/server compile paths.

### Phase 2: Security & Authentication Layer (Est. 2 Weeks)
* Configure MongoDB database layer using Mongoose connection pooling and error-resilient reconnects.
* Implement User and RefreshToken schemas with strict validation.
* Build the core JWT service implementing RTR cookie creation, passport Google login handlers, and Express auth validation middlewares.
* Design clean client-side authentication contextual hooks (`useAuth`).

### Phase 3: Document Engineering & Storage (Est. 2 Weeks)
* Build `IStorageService` integrating local filesystem drivers and production-ready AWS S3 adapter.
* Construct the Python execution gateway service mapping `pdf2docx`, `camelot-py` and OCR operations.
* Build client-side PDF processors utilizing `pdf-lib` and `jsPDF` for simple immediate in-browser tools (Merger, Splitter, Rotator).
* Ensure proper upload limit controllers and sanitize check guards for uploaded files.

### Phase 4: Subscriptions, Payments & Premium Hub (Est. 2 Weeks)
* Configure Razorpay billing controllers on the Express server.
* Build HMAC signature verification endpoints with precise transactional records logs inside MongoDB.
* Build client billing widgets, plan comparisons dashboards, and transactional history panels.
* Implement real-time tier check guards on server processing endpoints.

### Phase 5: Support, Admin Controls & Analytics (Est. 2 Weeks)
* Design AdminPanel views featuring multi-metric charts (monthly revenues, files processed counts, tool usage distribution).
* Create Feedbacks and support tickets CRUD routers.
* Build system parameters config settings schema allowing dynamic administration controls.

### Phase 6: QA, Performance Audits & Deployment (Est. 2 Weeks)
* Implement integrated automated error handling checkpoints.
* Perform comprehensive load testing and audit server processing bottlenecks.
* Build production-grade Docker environments and automate secure deployment channels via Cloud Run.

---

### Verification and Approval
This complete architectural framework represents the pinnacle of SaaS product design. Proceed to individual component creation and coding pipelines once the overarching blueprint is finalized and approved.
