import type { Appeal, AppConfig, AuthUser, GradeInput, GradingResult, JobMeta } from './types';

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message =
      (data as { error?: string } | null)?.error ||
      (res.status === 413 ? '上传内容过大，请压缩图片或减少页数。' : `请求失败（HTTP ${res.status}）`);
    throw new Error(message);
  }
  return data as T;
}

export async function fetchAppConfig(): Promise<AppConfig> {
  return parseResponse<AppConfig>(await fetch('/api/config'));
}

function gradePayload(input: GradeInput) {
  return {
    problemText: input.problemText,
    problemImages: input.problemImages.map((image) => image.dataUrl),
    solutionImages: input.solutionImages.map((image) => image.dataUrl),
    rubricText: input.rubricText,
    rubricImages: input.rubricImages.map((image) => image.dataUrl),
    rubricName: input.rubricName,
    rubricItems: input.rubricItems,
    rubricQuestions: input.rubricQuestions,
    rubricTemplate: input.rubricTemplate,
    maxScore: input.maxScore,
    category: input.category,
    scoreUnit: input.scoreUnit,
    paperMode: input.paperMode,
    providerId: input.providerId,
    model: input.model,
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
    strictness: input.strictness,
    studentName: input.studentName,
    sourceLabel: input.sourceLabel,
  };
}

export async function startGrade(input: GradeInput, signal?: AbortSignal): Promise<{ taskId: string; status: string }> {
  const res = await fetch('/api/grade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...gradePayload(input), async: true }),
    signal,
  });
  return parseResponse<{ taskId: string; status: string }>(res);
}

export async function fetchTask(taskId: string): Promise<{
  id: string;
  status: 'processing' | 'done' | 'error';
  result?: { job: GradingResult; warnings?: string[] };
  error?: string;
}> {
  const data = await parseResponse<{
    task: {
      id: string;
      status: 'processing' | 'done' | 'error';
      result?: { job: GradingResult; warnings?: string[] };
      error?: string;
    };
  }>(await fetch(`/api/tasks/${encodeURIComponent(taskId)}`));
  return data.task;
}

export async function fetchJobs(): Promise<JobMeta[]> {
  const data = await parseResponse<{ jobs: JobMeta[] }>(await fetch('/api/jobs'));
  return data.jobs;
}

export async function fetchJob(id: string): Promise<GradingResult> {
  const data = await parseResponse<{ job: GradingResult }>(await fetch(`/api/jobs/${id}`));
  return data.job;
}

export async function removeJob(id: string): Promise<void> {
  await parseResponse(await fetch(`/api/jobs/${id}`, { method: 'DELETE' }));
}

export async function testConnection(payload: {
  providerId: string;
  model: string;
  baseUrl?: string;
  apiKey?: string;
}): Promise<{ ok: boolean; latencyMs: number; model: string; sample?: string }> {
  const res = await fetch('/api/test-connection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseResponse(res);
}

export function pdfUrl(id: string) {
  return `/api/jobs/${id}/pdf`;
}



export async function fetchAuthMe(): Promise<AuthUser | null> {
  const res = await fetch('/api/auth/me');
  if (res.status === 401) return null;
  const data = await parseResponse<{ user: AuthUser | null }>(res);
  return data.user;
}

export async function loginUser(username: string, password: string): Promise<AuthUser> {
  const data = await parseResponse<{ user: AuthUser }>(await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }));
  return data.user;
}

export async function registerUser(username: string, password: string): Promise<AuthUser> {
  const data = await parseResponse<{ user: AuthUser }>(await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }));
  return data.user;
}

export async function logoutUser(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}


export async function submitAppeal(jobId: string, message: string, contact?: string): Promise<Appeal> {
  const data = await parseResponse<{ appeal: Appeal }>(await fetch(`/api/jobs/${encodeURIComponent(jobId)}/appeal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, contact }),
  }));
  return data.appeal;
}

export async function fetchAppeals(): Promise<Appeal[]> {
  const data = await parseResponse<{ appeals: Appeal[] }>(await fetch('/api/appeals'));
  return data.appeals;
}

export async function updateAppeal(id: string, payload: { status?: Appeal['status']; adminResponse?: string }): Promise<Appeal> {
  const data = await parseResponse<{ appeal: Appeal }>(await fetch(`/api/appeals/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
  return data.appeal;
}
