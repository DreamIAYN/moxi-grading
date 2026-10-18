import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { DATA_DIR } from './store.mjs';

const scrypt = promisify(crypto.scrypt);
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const COOKIE_NAME = 'moxi_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const ADMIN_USERNAME = process.env.SUPER_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || '';

function normalizeUsername(value) {
  return String(value || '').trim();
}

function usernameKey(value) {
  return normalizeUsername(value).toLowerCase();
}

function publicUser(user) {
  return { id: user.id, username: user.username, role: user.role || 'user', createdAt: user.createdAt || null };
}

function validateCredentials(username, password) {
  const name = normalizeUsername(username);
  if (!/^[\p{L}\p{N}_-]{2,24}$/u.test(name)) {
    const error = new Error('用户名需为 2–24 个字符，只能包含文字、数字、下划线或短横线。');
    error.status = 400;
    throw error;
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
    const error = new Error('密码长度需为 6–72 个字符。');
    error.status = 400;
    throw error;
  }
  return name;
}

async function readUsers() {
  try {
    const raw = await fs.readFile(USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeUsers(users) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${USERS_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(users, null, 2), { mode: 0o600 });
  await fs.rename(tmp, USERS_FILE);
}

async function hashPassword(password, salt) {
  return (await scrypt(password, salt, 64)).toString('hex');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function registerUser(username, password) {
  const name = validateCredentials(username, password);
  const key = usernameKey(name);
  if (ADMIN_PASSWORD && key === usernameKey(ADMIN_USERNAME)) {
    const error = new Error('该用户名已被保留。');
    error.status = 409;
    throw error;
  }
  const users = await readUsers();
  if (users.some((user) => usernameKey(user.username) === key)) {
    const error = new Error('用户名已存在，请换一个。');
    error.status = 409;
    throw error;
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    id: `u-${crypto.randomBytes(6).toString('hex')}`,
    username: name,
    usernameKey: key,
    salt,
    passwordHash: await hashPassword(password, salt),
    role: 'user',
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await writeUsers(users);
  return publicUser(user);
}

export async function verifyLogin(username, password) {
  const name = normalizeUsername(username);
  if (ADMIN_PASSWORD && name.toLowerCase() === ADMIN_USERNAME.toLowerCase() && safeEqual(password, ADMIN_PASSWORD)) {
    return { id: 'admin', username: ADMIN_USERNAME, role: 'admin', createdAt: null };
  }
  const users = await readUsers();
  const user = users.find((item) => item.usernameKey === usernameKey(name));
  if (!user) return null;
  const hash = await hashPassword(String(password || ''), user.salt);
  if (!safeEqual(hash, user.passwordHash)) return null;
  return publicUser(user);
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}

export function issueSession(user) {
  const payload = base64url(JSON.stringify({
    uid: user.id,
    username: user.username,
    role: user.role,
    exp: Date.now() + SESSION_TTL_MS,
  }));
  return `${payload}.${sign(payload)}`;
}

export function readSession(req) {
  const raw = req.headers.cookie || '';
  const cookie = raw.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return null;
  const token = decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1));
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now() || !data.uid) return null;
    return { id: String(data.uid), username: String(data.username || ''), role: data.role === 'admin' ? 'admin' : 'user' };
  } catch {
    return null;
  }
}

export function sessionCookie(req, user) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(issueSession(user))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`;
}

export function clearSessionCookie(req) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function attachUser(req, _res, next) {
  req.user = readSession(req);
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录。' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录。' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: '需要超级管理员权限。' });
  next();
}

export { publicUser };
