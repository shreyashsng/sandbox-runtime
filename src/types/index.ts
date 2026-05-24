import { z } from "zod";

export type Language = "nodejs" | "python";
export type ExecutionStatus = "queued" | "running" | "success" | "failed" | "killed";

export type ExecutionRequest = {
  language: Language;
  code: string;
  sessionId?: string;
  packages?: string[];
  timeoutMs?: number;
};

export type ExecutionResult = {
  jobId: string;
  status: ExecutionStatus;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number | null;
  memoryUsedMb: number | null;
  cpuPercent: number | null;
  language: Language;
  createdAt: string;
};

export type JobPayload = ExecutionRequest & {
  jobId: string;
  apiKeyId: string;
  createdAt: string;
};

export const ExecutionRequestSchema = z.object({
  language: z.enum(["nodejs", "python"]),
  code: z.string(),
  sessionId: z.string().optional(),
  packages: z.array(z.string()).optional(),
  timeoutMs: z.number().optional(),
});

export const ApiKeyCreateSchema = z.object({
  name: z.string().min(1).max(255),
});

export type ExecutionRequestPayload = z.infer<typeof ExecutionRequestSchema>;
export type ApiKeyCreatePayload = z.infer<typeof ApiKeyCreateSchema>;
