export type ToolCategory = 'organize' | 'convert' | 'optimize' | 'security' | 'edit';

export type ProcessingStatus = 'idle' | 'uploading' | 'processing' | 'completed' | 'failed';

export interface User {
  id: string;
  email: string;
  fullName: string;
  plan: 'free' | 'pro';
  dailyUsageCount: number;
  maxFilesLimit: number;
  maxSizeLimit: number; // MB
}

export interface ToolDef {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  maxSizeMB: number;
  allowedMimeTypes: string[];
  requiresOptions?: boolean;
}

export interface ProcessingState {
  status: ProcessingStatus;
  progress: number; // 0 to 100
  error: string | null;
  outputName: string | null;
  outputUrl: string | null;
  outputSize: number | null;
}

export interface HistoryRecord {
  id: string;
  toolId: string;
  fileName: string;
  fileSize: number;
  outputName?: string;
  outputSize?: number;
  status: 'success' | 'failed';
  processedAt: string;
  errorMessage?: string;
}

export interface ValidationResult {
  isValid: boolean;
  error: string | null;
}
