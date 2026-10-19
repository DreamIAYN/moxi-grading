import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR, ensureDirs } from './store.mjs';

const APPEALS_DIR = path.join(DATA_DIR, 'appeals');
const STATUSES = new Set(['open', 'reviewing', 'resolved', 'rejected']);

async function ensureAppealsDir() {
  await ensureDirs();
  await fs.mkdir(APPEALS_DIR, { recursive: true });
}

function validId(id) {
  return /^ap-[a-z0-9-]+$/i.test(id);
}

export async function createAppeal({ jobId, userId, username, message, contact = '' }) {
  await ensureAppealsDir();
  const text = String(message || '').trim();
  if (text.length < 5 || text.length > 3000) {
    const error = new Error('申诉内容需为 5–3000 个字符。');
    error.status = 400;
    throw error;
  }
  const existing = (await listAppeals()).find((item) => item.jobId === jobId && item.userId === userId && item.status === 'open');
  if (existing) {
    const error = new Error('这份报告已有一条待处理申诉。');
    error.status = 409;
    throw error;
  }
  const id = `ap-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const record = {
    id,
    jobId,
    userId,
    username,
    message: text,
    contact: String(contact || '').trim().slice(0, 160),
    status: 'open',
    adminResponse: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(APPEALS_DIR, `${id}.json`), JSON.stringify(record, null, 2), { mode: 0o600 });
  return record;
}

export async function listAppeals() {
  await ensureAppealsDir();
  const entries = await fs.readdir(APPEALS_DIR).catch(() => []);
  const records = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    try {
      records.push(JSON.parse(await fs.readFile(path.join(APPEALS_DIR, entry), 'utf8')));
    } catch {
      // Ignore corrupt records.
    }
  }
  return records.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function readAppeal(id) {
  if (!validId(id)) throw new Error('申诉编号无效');
  return JSON.parse(await fs.readFile(path.join(APPEALS_DIR, `${id}.json`), 'utf8'));
}

export async function updateAppeal(id, { status, adminResponse }) {
  const record = await readAppeal(id);
  if (status !== undefined) {
    if (!STATUSES.has(status)) {
      const error = new Error('申诉状态无效。');
      error.status = 400;
      throw error;
    }
    record.status = status;
  }
  if (adminResponse !== undefined) record.adminResponse = String(adminResponse || '').trim().slice(0, 3000);
  record.updatedAt = new Date().toISOString();
  await fs.writeFile(path.join(APPEALS_DIR, `${id}.json`), JSON.stringify(record, null, 2), { mode: 0o600 });
  return record;
}
