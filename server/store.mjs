import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { makeJobId } from './grading.mjs';

const ROOT = path.resolve(process.cwd());
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
export const JOBS_DIR = path.join(DATA_DIR, 'jobs');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');
export const RUBRICS_DIR = path.join(DATA_DIR, 'rubrics');

export async function ensureDirs() {
  await fs.mkdir(JOBS_DIR, { recursive: true });
  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.mkdir(RUBRICS_DIR, { recursive: true });
}

const MAX_PER_IMAGE = 14 * 1024 * 1024;
const MAX_TOTAL = 110 * 1024 * 1024;

function detectImage(buffer) {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (
    buffer.length > 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (
    buffer.length > 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

function decodeImage(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    throw new Error('图片格式无效');
  }
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) throw new Error('图片编码无效');
  const buffer = Buffer.from(match[1].replace(/\s/g, ''), 'base64');
  if (!buffer.length) throw new Error('图片内容为空');
  if (buffer.length > MAX_PER_IMAGE) throw new Error('单张图片过大，请压缩后重试');
  const type = detectImage(buffer);
  if (!type) throw new Error('仅支持 JPG / PNG / WEBP 图片');
  return { buffer, ...type };
}

async function saveImageGroup(jobDir, group, list, limit) {
  if (!Array.isArray(list)) return [];
  if (list.length > limit) throw new Error(`图片数量超过上限（${limit} 张）`);
  const names = [];
  for (let i = 0; i < list.length; i += 1) {
    const decoded = decodeImage(list[i]);
    const name = `${group}-${i + 1}.${decoded.ext}`;
    await fs.writeFile(path.join(jobDir, name), decoded.buffer);
    names.push(name);
  }
  return names;
}

export async function createRubricRecord({ rubric, pdfBuffer, problemText, source, userId, username }) {
  await ensureDirs();
  const id = `rub-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const dir = path.join(RUBRICS_DIR, id);
  await fs.mkdir(dir, { recursive: true });
  const record = {
    id,
    createdAt: new Date().toISOString(),
    problemText,
    source,
    userId: userId || '',
    username: username || '',
    rubric,
  };
  await fs.writeFile(path.join(dir, 'rubric.json'), JSON.stringify(record, null, 2));
  await fs.writeFile(path.join(dir, 'rubric.pdf'), pdfBuffer);
  return record;
}

export async function readRubricRecord(id) {
  if (!/^rub-[a-z0-9-]+$/i.test(id)) throw new Error('评分标准编号无效');
  const raw = await fs.readFile(path.join(RUBRICS_DIR, id, 'rubric.json'), 'utf8');
  return JSON.parse(raw);
}

export async function rubricPdfPath(id) {
  const record = await readRubricRecord(id);
  const file = path.join(RUBRICS_DIR, record.id, 'rubric.pdf');
  await fs.access(file);
  return file;
}

export function publicRubric(record) {
  return {
    ...record.rubric,
    id: record.id,
    pdfUrl: `/api/rubrics/${record.id}/pdf`,
    createdAt: record.createdAt,
  };
}

export async function createJob({ input, result, providerName, userId, username }) {
  await ensureDirs();
  const id = makeJobId();
  const jobDir = path.join(JOBS_DIR, id);
  await fs.mkdir(jobDir, { recursive: true });
  try {
    const totalRaw = ['problemImages', 'solutionImages', 'rubricImages']
      .flatMap((key) => (Array.isArray(input[key]) ? input[key] : []))
      .reduce((sum, item) => sum + (typeof item === 'string' ? item.length : 0), 0);
    if (totalRaw > MAX_TOTAL) throw new Error('上传图片总大小过大，请减少页数或压缩图片');

    const problemFiles = await saveImageGroup(jobDir, 'problem', input.problemImages, 8);
    const solutionFiles = await saveImageGroup(jobDir, 'solution', input.solutionImages, 100);
    const rubricFiles = await saveImageGroup(jobDir, 'rubric', input.rubricImages, 12);

    const job = {
      id,
      createdAt: new Date().toISOString(),
      providerName: providerName || '',
      userId: userId || '',
      username: username || '',
      rubricId: input.rubricId || result.generatedRubric?.id || '',
      input: {
        problemText: input.problemText || '',
        rubricText: input.rubricText || '',
        rubricName: input.rubricName || '',
        rubricItems: input.rubricItems || [],
        maxScore: input.maxScore,
        category: input.category || 'other',
        scoreUnit: input.scoreUnit || 1,
        paperMode: Boolean(input.paperMode),
        rubricQuestions: input.rubricQuestions || [],
        rubricId: input.rubricId || '',
        providerId: input.providerId,
        model: input.model,
        strictness: input.strictness,
        studentName: input.studentName || '',
        sourceLabel: input.sourceLabel || '',
      },
      files: { problem: problemFiles, solution: solutionFiles, rubric: rubricFiles },
      result,
    };
    await fs.writeFile(path.join(jobDir, 'job.json'), JSON.stringify(job, null, 2));
    return job;
  } catch (error) {
    await fs.rm(jobDir, { recursive: true, force: true });
    throw error;
  }
}

export function imageUrls(job) {
  const prefix = `/api/jobs/${job.id}/image`;
  const map = (group, files) => files.map((_, index) => `${prefix}/${group}/${index}`);
  return {
    problem: map('problem', job.files.problem),
    solution: map('solution', job.files.solution),
    rubric: map('rubric', job.files.rubric),
  };
}

export function publicJob(job) {
  const urls = imageUrls(job);
  return {
    id: job.id,
    createdAt: job.createdAt,
    providerName: job.providerName,
    ownerName: job.username || '',
    ...job.result,
    problemText: job.input.problemText,
    rubricText: job.input.rubricText,
    rubricName: job.input.rubricName,
    maxScore: job.result.maxScore,
    problemImages: urls.problem,
    solutionImages: urls.solution,
    rubricImages: urls.rubric,
    studentName: job.input.studentName,
    sourceLabel: job.input.sourceLabel,
  };
}

function plainPreview(text) {
  return String(text || '')
    .replace(/\$\$([\s\S]*?)\$\$/g, '$1')
    .replace(/\$([^$]*?)\$/g, '$1')
    .replace(/\\\[|\\\]|\\\(|\\\)/g, '')
    .replace(/\\left|\\right/g, '')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function jobSummary(job) {
  const problem = plainPreview(job.input.problemText);
  return {
    id: job.id,
    createdAt: job.createdAt,
    score: job.result.score,
    maxScore: job.result.maxScore,
    gradeLabel: job.result.gradeLabel,
    providerName: job.providerName,
    ownerName: job.username || '',
    userId: job.userId || '',
    model: job.input.model,
    demo: Boolean(job.result.demo),
    problemExcerpt: problem.slice(0, 92) || '（图片题目）',
    solutionCount: job.files.solution.length,
    category: job.result.category || job.input.category,
    categoryLabel: job.result.categoryLabel,
    paperMode: Boolean(job.result.paperMode),
  };
}

export async function readJob(id) {
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error('报告编号无效');
  const file = path.join(JOBS_DIR, id, 'job.json');
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw);
}

export async function listJobs(limit = 60) {
  await ensureDirs();
  const entries = await fs.readdir(JOBS_DIR, { withFileTypes: true });
  const jobs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const job = await readJob(entry.name);
      jobs.push(jobSummary(job));
    } catch {
      // Ignore interrupted jobs.
    }
  }
  jobs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return jobs.slice(0, limit);
}

export async function jobImagePath(job, group, index) {
  const files = job.files[group];
  if (!Array.isArray(files)) return null;
  const file = files[index];
  if (!file || !/^(problem|solution|rubric)-\d+\.(jpg|png|webp)$/.test(file)) return null;
  return path.join(JOBS_DIR, job.id, file);
}

export async function deleteJob(id) {
  const job = await readJob(id);
  await fs.rm(path.join(JOBS_DIR, job.id), { recursive: true, force: true });
  if (job.rubricId) {
    await fs.rm(path.join(RUBRICS_DIR, job.rubricId), { recursive: true, force: true }).catch(() => {});
  }
}

export function tempName(prefix = 'tmp') {
  return path.join(TMP_DIR, `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`);
}
