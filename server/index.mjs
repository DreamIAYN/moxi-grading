import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import process from 'node:process';
import { timingSafeEqual, randomBytes } from 'node:crypto';
import {
  PROVIDERS,
  publicProviders,
  getProvider,
  resolveApiKey,
  normalizeBaseUrl,
  isKnownTextOnly,
  callChatModel,
  testProvider,
} from './providers.mjs';
import { gradeWithModel, normalizeResult, demoResult, demoFromRubric, makeJobId } from './grading.mjs';
import {
  createJob,
  publicJob,
  readJob,
  listJobs,
  jobImagePath,
  deleteJob,
  createRubricRecord,
  publicRubric,
  readRubricRecord,
  rubricPdfPath,
} from './store.mjs';
import {
  sanitizeTemplate,
  fallbackRubric,
  templateToRubric,
  normalizeGeneratedRubric,
  generateRubricWithModel,
  buildRubricText,
} from './rubric.mjs';
import { buildRubricPdf } from './rubric-pdf.mjs';
import { getScoreScheme, normalizePaperQuestions, categoryLabel } from './scoring.mjs';
import { generatePdf, texStatus } from './pdf.mjs';
import { searchWeb } from './search.mjs';
import { createAppeal, listAppeals, readAppeal, updateAppeal } from './appeals.mjs';
import {
  attachUser,
  requireUser,
  verifyLogin,
  registerUser,
  publicUser,
  sessionCookie,
  clearSessionCookie,
} from './auth.mjs';

const app = express();
const PORT = Number(process.env.PORT || 8787);
const ROOT = process.cwd();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '92mb' }));
app.use(attachUser);

const INTERNAL_GRADE_TOKEN = randomBytes(24).toString('hex');
const backgroundTasks = new Map();

const TRIAL_USER = process.env.APP_ACCESS_USER || 'trial';
const TRIAL_PASSWORD = process.env.APP_ACCESS_PASSWORD || '';
const TRIAL_GRADES_PER_HOUR = Number(process.env.TRIAL_GRADES_PER_HOUR || 8);

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

if (TRIAL_PASSWORD) {
  app.use((req, res, next) => {
    if (req.path === '/api/health') return next();
    if (safeEqual(req.headers['x-internal-grade'] || '', INTERNAL_GRADE_TOKEN)) return next();
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const header = req.headers.authorization || '';
    if (header.startsWith('Basic ')) {
      try {
        const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
        const index = decoded.indexOf(':');
        const user = index >= 0 ? decoded.slice(0, index) : '';
        const password = index >= 0 ? decoded.slice(index + 1) : '';
        if (safeEqual(user, TRIAL_USER) && safeEqual(password, TRIAL_PASSWORD)) return next();
      } catch {
        // Fall through to the 401.
      }
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Moxi Trial", charset="UTF-8"');
    res.status(401).type('text/plain; charset=utf-8').send('需要试用访问码。请联系分享者获取账号与密码。');
  });
}

const activeGrading = new Map();
const requestLog = new Map();

function isLocalIp(ip) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'local', 'internal'].includes(String(ip));
}

function checkRate(ip) {
  if (isLocalIp(ip)) return;
  const now = Date.now();
  const entry = requestLog.get(ip) || { count: 0, reset: now + 60_000 };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + 60_000;
  }
  entry.count += 1;
  requestLog.set(ip, entry);
  if (entry.count > 40) {
    const error = new Error('请求过于频繁，请稍后再试。');
    error.status = 429;
    throw error;
  }
}


const trialQuota = new Map();

function checkTrialQuota(ip) {
  if (isLocalIp(ip)) return;
  if (!Number.isFinite(TRIAL_GRADES_PER_HOUR) || TRIAL_GRADES_PER_HOUR <= 0) return;
  const now = Date.now();
  const entry = trialQuota.get(ip) || { count: 0, reset: now + 3_600_000 };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + 3_600_000;
  }
  entry.count += 1;
  trialQuota.set(ip, entry);
  if (entry.count > TRIAL_GRADES_PER_HOUR) {
    const error = new Error(`试用额度已用完（每 IP 每小时 ${TRIAL_GRADES_PER_HOUR} 次），请稍后再试。`);
    error.status = 429;
    throw error;
  }
}

function activeGradingTotal() {
  return Array.from(activeGrading.values()).reduce((sum, value) => sum + value, 0);
}

function requireString(value, name, max = 30_000, required = false) {
  if (value === undefined || value === null) {
    if (required) {
      const error = new Error(`${name}不能为空`);
      error.status = 400;
      throw error;
    }
    return '';
  }
  if (typeof value !== 'string') {
    const error = new Error(`${name}格式无效`);
    error.status = 400;
    throw error;
  }
  const trimmed = value.trim();
  if (required && !trimmed) {
    const error = new Error(`${name}不能为空`);
    error.status = 400;
    throw error;
  }
  if (trimmed.length > max) {
    const error = new Error(`${name}过长，请精简后重试`);
    error.status = 400;
    throw error;
  }
  return trimmed;
}

function requireImageList(value, name, limit) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    const error = new Error(`${name}格式无效`);
    error.status = 400;
    throw error;
  }
  if (value.length > limit) {
    const error = new Error(`${name}最多 ${limit} 张`);
    error.status = 400;
    throw error;
  }
  for (const item of value) {
    if (typeof item !== 'string' || !item.startsWith('data:image/')) {
      const error = new Error(`${name}包含无效图片`);
      error.status = 400;
      throw error;
    }
  }
  return value;
}

function validateBaseUrl(value) {
  if (!value) return '';
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    const error = new Error('接口地址无效');
    error.status = 400;
    throw error;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    const error = new Error('接口地址只支持 HTTP / HTTPS');
    error.status = 400;
    throw error;
  }
  return parsed.toString().replace(/\/+$/, '');
}

app.get('/api/health', async (_req, res) => {
  const tex = await texStatus();
  res.json({ ok: true, pdfAvailable: tex.available, texVersion: tex.version });
});

const authAttempts = new Map();

function checkAuthRate(ip) {
  const now = Date.now();
  const entry = authAttempts.get(ip) || { count: 0, reset: now + 10 * 60_000 };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + 10 * 60_000;
  }
  entry.count += 1;
  authAttempts.set(ip, entry);
  if (entry.count > 20) {
    const error = new Error('登录尝试过于频繁，请稍后再试。');
    error.status = 429;
    throw error;
  }
}

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

app.post('/api/auth/register', async (req, res, next) => {
  try {
    checkAuthRate(req.ip || 'local');
    const user = await registerUser(req.body?.username, req.body?.password);
    res.setHeader('Set-Cookie', sessionCookie(req, user));
    res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    checkAuthRate(req.ip || 'local');
    const user = await verifyLogin(req.body?.username, req.body?.password);
    if (!user) {
      const error = new Error('用户名或密码不正确。');
      error.status = 401;
      throw error;
    }
    res.setHeader('Set-Cookie', sessionCookie(req, user));
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', clearSessionCookie(req));
  res.json({ ok: true });
});

app.get('/api/config', async (_req, res) => {
  const tex = await texStatus();
  res.json({
    providers: publicProviders(),
    pdfAvailable: tex.available,
    texVersion: tex.version,
    demoAvailable: true,
    maxImages: 12,
  });
});

function requireUserOrInternal(req, res, next) {
  if (safeEqual(req.headers['x-internal-grade'] || '', INTERNAL_GRADE_TOKEN)) {
    req.user = {
      id: String(req.headers['x-user-id'] || 'internal'),
      username: decodeURIComponent(String(req.headers['x-user-name'] || 'internal')),
      role: 'user',
    };
    return next();
  }
  return requireUser(req, res, next);
}

app.use('/api/jobs', requireUser);
app.use('/api/rubrics', requireUser);
app.use('/api/tasks', requireUser);
app.use('/api/appeals', requireUser);
app.use('/api/grade', requireUserOrInternal);
app.use('/api/test-connection', requireUser);

function canAccessJob(job, user) {
  return Boolean(user && (user.role === 'admin' || job.userId === user.id));
}

function assertJobAccess(job, user) {
  if (!canAccessJob(job, user)) {
    const error = new Error('报告不存在。');
    error.status = 404;
    throw error;
  }
}

async function readJobForUser(req) {
  const job = await readJob(req.params.id);
  assertJobAccess(job, req.user);
  return job;
}

app.get('/api/jobs', async (req, res, next) => {
  try {
    const jobs = await listJobs();
    res.json({ jobs: req.user.role === 'admin' ? jobs : jobs.filter((job) => job.userId === req.user.id) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/jobs/:id', async (req, res, next) => {
  try {
    const job = await readJobForUser(req);
    res.json({ job: publicJob(job) });
  } catch (error) {
    error.status = 404;
    next(error);
  }
});

app.get('/api/jobs/:id/image/:group/:index', async (req, res, next) => {
  try {
    const job = await readJobForUser(req);
    const group = req.params.group;
    if (!['problem', 'solution', 'rubric'].includes(group)) throw new Error('图片来源无效');
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0) throw new Error('图片序号无效');
    const file = await jobImagePath(job, group, index);
    if (!file) throw new Error('图片不存在');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(path.resolve(file));
  } catch (error) {
    error.status = 404;
    next(error);
  }
});

app.get('/api/jobs/:id/pdf', async (req, res, next) => {
  try {
    const job = await readJobForUser(req);
    const pdf = await generatePdf(job);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="moxi-report-${job.id}.pdf"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(path.resolve(pdf));
  } catch (error) {
    if (!error.status) {
      error.status = 503;
      error.expose = true;
    }
    next(error);
  }
});


app.get('/api/rubrics/:id', async (req, res, next) => {
  try {
    const record = await readRubricRecord(req.params.id);
    if (req.user.role !== 'admin' && record.userId !== req.user.id) throw new Error('评分标准不存在');
    res.json({ rubric: publicRubric(record) });
  } catch (error) {
    error.status = 404;
    next(error);
  }
});

app.get('/api/rubrics/:id/pdf', async (req, res, next) => {
  try {
    const record = await readRubricRecord(req.params.id);
    if (req.user.role !== 'admin' && record.userId !== req.user.id) throw new Error('评分标准不存在');
    const file = await rubricPdfPath(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="rubric-${req.params.id}.pdf"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(path.resolve(file));
  } catch (error) {
    error.status = error.status || 404;
    next(error);
  }
});

app.post('/api/jobs/:id/appeal', async (req, res, next) => {
  try {
    const job = await readJobForUser(req);
    const record = await createAppeal({
      jobId: job.id,
      userId: req.user.id,
      username: req.user.username,
      message: req.body?.message,
      contact: req.body?.contact,
    });
    res.status(201).json({ appeal: record });
  } catch (error) {
    next(error);
  }
});

app.get('/api/jobs/:id/appeal', async (req, res, next) => {
  try {
    const job = await readJobForUser(req);
    const appeals = (await listAppeals()).filter((item) => item.jobId === job.id && (req.user.role === 'admin' || item.userId === req.user.id));
    res.json({ appeals });
  } catch (error) {
    next(error);
  }
});

app.get('/api/appeals', async (req, res, next) => {
  try {
    const appeals = (await listAppeals()).filter((item) => req.user.role === 'admin' || item.userId === req.user.id);
    res.json({ appeals });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/appeals/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      const error = new Error('需要超级管理员权限。');
      error.status = 403;
      throw error;
    }
    const record = await readAppeal(req.params.id);
    const updated = await updateAppeal(record.id, {
      status: req.body?.status,
      adminResponse: req.body?.adminResponse,
    });
    res.json({ appeal: updated });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/jobs/:id', async (req, res, next) => {
  try {
    await readJobForUser(req);
    await deleteJob(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    error.status = 404;
    next(error);
  }
});

app.post('/api/test-connection', async (req, res, next) => {
  try {
    const providerId = req.body?.providerId;
    const provider = getProvider(providerId);
    if (!provider) {
      const error = new Error('未知的模型服务商');
      error.status = 400;
      throw error;
    }
    if (provider.id === 'demo') {
      return res.json({ ok: true, latencyMs: 1, model: 'demo', sample: '演示模式无需连接' });
    }
    const model = requireString(req.body?.model, '模型名称', 120, true);
    const baseUrl = validateBaseUrl(req.body?.baseUrl) || normalizeBaseUrl(provider);
    const apiKey = resolveApiKey(provider, requireString(req.body?.apiKey, 'API Key', 400));
    if (!apiKey) {
      const error = new Error('未填写 API Key，服务端也没有配置对应的环境变量。');
      error.status = 401;
      throw error;
    }
    const result = await testProvider({ baseUrl, apiKey, model });
    res.json({ ...result, model });
  } catch (error) {
    next(error);
  }
});

app.get('/api/tasks/:id', (req, res) => {
  const task = backgroundTasks.get(req.params.id);
  if (!task || (req.user.role !== 'admin' && task.userId !== req.user.id)) {
    return res.status(404).json({ error: '任务不存在或已过期。' });
  }
  res.json({ task });
});

app.post('/api/grade', async (req, res, next) => {
  const body = req.body || {};
  const internal = safeEqual(req.headers['x-internal-grade'] || '', INTERNAL_GRADE_TOKEN);
  const ip = internal
    ? String(req.headers['x-client-ip'] || 'internal')
    : String(req.headers['cf-connecting-ip'] || req.ip || 'local');
  const clientAbort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) clientAbort.abort();
  });
  try {
    if (body.async && !internal) {
      checkRate(ip);
      checkTrialQuota(ip);
      if (!isLocalIp(ip) && ((activeGrading.get(ip) || 0) >= 2 || activeGradingTotal() >= 4)) {
        const error = new Error('当前批改任务较多，请稍后再试。');
        error.status = 429;
        throw error;
      }
      const taskId = makeJobId();
      backgroundTasks.set(taskId, { id: taskId, status: 'processing', userId: req.user.id, username: req.user.username, createdAt: new Date().toISOString() });
      const url = `http://127.0.0.1:${PORT}/api/grade`;
      void fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Grade': INTERNAL_GRADE_TOKEN,
          'X-Client-IP': ip,
          'X-User-Id': req.user.id,
          'X-User-Name': encodeURIComponent(req.user.username),
        },
        body: JSON.stringify({ ...body, async: false }),
      })
        .then(async (response) => {
          const data = await response.json().catch(() => null);
          if (!response.ok) throw new Error(data?.error || `批改失败（HTTP ${response.status}）`);
          backgroundTasks.set(taskId, { ...backgroundTasks.get(taskId), id: taskId, status: 'done', result: data, finishedAt: new Date().toISOString() });
        })
        .catch((error) => {
          backgroundTasks.set(taskId, { ...backgroundTasks.get(taskId), id: taskId, status: 'error', error: error.message || '批改失败', finishedAt: new Date().toISOString() });
        })
        .finally(() => {
          setTimeout(() => backgroundTasks.delete(taskId), 2 * 60 * 60 * 1000).unref();
        });
      return res.status(202).json({ taskId, status: 'processing' });
    }
    if (!internal) {
      checkRate(ip);
      checkTrialQuota(ip);
    }
    const providerId = body.providerId || 'demo';
    const provider = getProvider(providerId);
    if (!provider) {
      const error = new Error('未知的模型服务商');
      error.status = 400;
      throw error;
    }
    if (!isLocalIp(ip) && (activeGrading.get(ip) || 0) >= 2) {
      const error = new Error('已有批改任务正在进行，请等待当前任务完成。');
      error.status = 429;
      throw error;
    }
    if (!isLocalIp(ip) && activeGradingTotal() >= 4) {
      const error = new Error('当前试用人数较多，请稍等几十秒再试。');
      error.status = 429;
      throw error;
    }

    const problemText = requireString(body.problemText, '题目文字', 60_000);
    const problemImages = requireImageList(body.problemImages, '题目图片', 8);
    const solutionImages = requireImageList(body.solutionImages, '解答图片', 12);
    const rubricImages = requireImageList(body.rubricImages, '评分标准图片', 12);
    const suppliedRubricText = requireString(body.rubricText, '答案与评分标准', 60_000);
    const rubricName = requireString(body.rubricName, '评分标准名称', 120) || '自动研判';
    const studentName = requireString(body.studentName, '学生姓名', 80);
    const sourceLabel = requireString(body.sourceLabel, '来源', 120);
    const strictness = ['standard', 'strict', 'encouraging'].includes(body.strictness)
      ? body.strictness
      : 'standard';
    const category = ['algebra', 'number-theory', 'combinatorics', 'geometry', 'cmo', 'first-exam', 'other'].includes(body.category)
      ? body.category
      : 'auto';
    const paperMode = Boolean(body.paperMode);
    const template = sanitizeTemplate(body.rubricTemplate);

    let maxScore = Number(body.maxScore);
    if (!Number.isFinite(maxScore) || maxScore < 1 || maxScore > 300) {
      const error = new Error('总分需在 1–300 之间');
      error.status = 400;
      throw error;
    }
    if (!problemText && !problemImages.length) {
      const error = new Error('请填写题目文字或上传题目图片');
      error.status = 400;
      throw error;
    }
    if (!solutionImages.length) {
      const error = new Error('请至少上传一页手写解答');
      error.status = 400;
      throw error;
    }

    let questionDefs = normalizePaperQuestions(
      Array.isArray(body.rubricQuestions) ? body.rubricQuestions : template?.questions || [],
    );
    if (paperMode) {
      if (!questionDefs.length) {
        const error = new Error('整卷模式需要题目结构（每道题的题号与满分）。请选择整卷模板，或关闭整卷模式。');
        error.status = 400;
        throw error;
      }
      const structureTotal = questionDefs.reduce((sum, item) => sum + item.max, 0);
      if (structureTotal > 0 && Math.abs(structureTotal - maxScore) > 0.01) {
        maxScore = structureTotal;
      }
    } else if (template?.official && template.total && template.mode !== 'paper') {
      maxScore = template.total;
      questionDefs = [];
    }

    if (category === 'cmo' && !paperMode) {
      maxScore = 21;
    }

    let scoreUnit = Number(body.scoreUnit);
    if (!Number.isFinite(scoreUnit) || scoreUnit <= 0) {
      scoreUnit = paperMode ? 1 : template?.unit || getScoreScheme(maxScore, undefined, paperMode).unit;
    }
    if (category === 'cmo' && !paperMode) {
      scoreUnit = 3;
    }
    const scheme = getScoreScheme(maxScore, scoreUnit, paperMode, category);
    const rubricItems = Array.isArray(body.rubricItems)
      ? body.rubricItems
          .filter((item) => item && typeof item === 'object')
          .slice(0, 24)
          .map((item) => ({
            name: String(item.name || '评分项').slice(0, 100),
            max: Math.max(0, Math.min(maxScore, Number(item.max) || 0)),
            description: String(item.description || '').slice(0, 1200),
            anchors: Array.isArray(item.anchors) ? item.anchors.slice(0, 8) : [],
          }))
      : [];

    let rubricText = suppliedRubricText;
    let effectiveRubricName = rubricName;
    let effectiveRubricItems = rubricItems;
    let effectiveQuestions = questionDefs;
    let generatedRubric = null;
    let rubricId = '';
    const warnings = [];
    const providedRubric = Boolean(suppliedRubricText.trim() || rubricImages.length);

    const model = requireString(body.model, '模型名称', 160, true);
    const baseUrl = validateBaseUrl(body.baseUrl) || normalizeBaseUrl(provider);
    const apiKey = resolveApiKey(provider, requireString(body.apiKey, 'API Key', 400));

    if (provider.id !== 'demo') {
      if (!apiKey) {
        const error = new Error(`未配置 ${provider.name} 的 API Key。请在「接入设置」中填写，或设置服务端环境变量 ${provider.envKey}。`);
        error.status = 401;
        throw error;
      }
      if (isKnownTextOnly(provider.id, model) && solutionImages.length > 0) {
        const error = new Error(`当前模型 ${model} 不支持图像输入。请改用支持视觉的模型（如 deepseek-flash / glm-4.6v），或选择 OpenCode Zen 的视觉模型。`);
        error.status = 400;
        throw error;
      }
    }

    const callModel = (options) =>
      callChatModel({
        baseUrl,
        apiKey,
        model,
        signal: clientAbort.signal,
        ...options,
      });

    activeGrading.set(ip, (activeGrading.get(ip) || 0) + 1);
    const started = Date.now();
    try {
      if (!providedRubric) {
        const rubricCtx = {
          total: maxScore,
          unit: paperMode ? 1 : scoreUnit,
          mode: paperMode ? 'paper' : scheme.mode,
          category,
          questions: questionDefs,
          template,
        };
        let rubric;
        if (provider.id === 'demo') {
          rubric = fallbackRubric(rubricCtx, template);
        } else if (template?.official) {
          rubric = templateToRubric(template, rubricCtx);
        } else {
          try {
            const images = [
              ...problemImages.map((dataUrl, index) => ({ label: `题目图 ${index + 1}`, dataUrl })),
              ...solutionImages.map((dataUrl, index) => ({ label: `学生解答第 ${index + 1} 页`, dataUrl })),
            ];
            const rawRubric = await generateRubricWithModel({
              callModel,
              args: {
                problemText,
                category,
                total: maxScore,
                unit: rubricCtx.unit,
                mode: rubricCtx.mode,
                questions: questionDefs,
                template,
                solutionCount: solutionImages.length,
              },
              images,
            });
            rubric = normalizeGeneratedRubric(rawRubric, rubricCtx);
          } catch (error) {
            console.error('[rubric] 自动制定评分标准失败，使用通用模板：', error.message);
            rubric = fallbackRubric(rubricCtx, template);
            warnings.push(`自动制定评分标准失败，已使用通用评分框架：${error.message}`);
          }
        }
        if (Array.isArray(rubric.citedResults) && rubric.citedResults.length) {
          const pending = rubric.citedResults
            .filter((item) => item && item.known !== true && (item.searchQuery || item.name))
            .slice(0, 5);
          await Promise.all(pending.map(async (item) => {
            try {
              item.searchResults = await searchWeb(item.searchQuery || item.name);
              if (!item.searchResults.length) item.searchError = '未搜索到结果';
            } catch (error) {
              item.searchResults = [];
              item.searchError = error.message || '联网核验失败';
            }
          }));
        }
        const pdfBuffer = await buildRubricPdf(rubric);
        const record = await createRubricRecord({
          rubric,
          pdfBuffer,
          problemText,
          source: rubric.source || '',
          userId: req.user.id,
          username: req.user.username,
        });
        generatedRubric = publicRubric(record);
        rubricId = generatedRubric.id;
        effectiveRubricName = generatedRubric.title;
        rubricText = generatedRubric.summary || buildRubricText(generatedRubric);
        effectiveRubricItems = (generatedRubric.criteria || []).map((item) => ({
          name: item.name,
          max: item.max,
          description: item.description,
          anchors: item.anchors,
        }));
        if (generatedRubric.questions?.length) effectiveQuestions = generatedRubric.questions;
      }

      const gradingCategory = category === 'auto' && generatedRubric?.category ? generatedRubric.category : category;
      let normalized;
      let usage = {};
      let demo = false;
      if (provider.id === 'demo') {
        demo = true;
        const keepRichSample = template?.id === 'auto' && !paperMode && gradingCategory === 'algebra' && maxScore === 12;
        if (keepRichSample) {
          normalized = demoResult({
            maxScore,
            rubricName: effectiveRubricName,
            rubricItems: effectiveRubricItems,
            problemText,
            solutionCount: solutionImages.length,
            category: gradingCategory,
            scoreUnit,
            paperMode,
            questions: effectiveQuestions,
            generatedRubric,
          });
        } else {
          normalized = demoFromRubric({
            rubric: generatedRubric || {
              title: effectiveRubricName,
              total: maxScore,
              unit: scoreUnit,
              mode: paperMode ? 'paper' : scheme.mode,
              criteria: effectiveRubricItems,
              questions: effectiveQuestions,
              category: gradingCategory,
              categoryLabel: categoryLabel(gradingCategory),
            },
            maxScore,
            solutionCount: solutionImages.length,
            category: gradingCategory,
            scoreUnit,
            paperMode,
            questions: effectiveQuestions,
          });
        }
      } else {
        const images = [
          ...problemImages.map((dataUrl, index) => ({ label: `题目图 ${index + 1}`, dataUrl })),
          ...solutionImages.map((dataUrl, index) => ({ label: `解答第 ${index + 1} 页`, dataUrl })),
          ...rubricImages.map((dataUrl, index) => ({ label: `评分标准图 ${index + 1}`, dataUrl })),
        ];
        const { raw, usage: used } = await gradeWithModel({
          callModel,
          args: {
            problemText,
            solutionCount: solutionImages.length,
            problemCount: problemImages.length,
            rubricText,
            rubricName: effectiveRubricName,
            maxScore,
            strictness,
            studentName,
            sourceLabel,
            category: gradingCategory,
            paperMode,
            questionDefs: effectiveQuestions,
            scoreScheme: scheme,
            studentRoute: generatedRubric?.studentRoute || null,
            citedResults: generatedRubric?.citedResults || [],
          },
          images,
          rubricItems: effectiveRubricItems,
        });
        normalized = normalizeResult(raw, {
          maxScore,
          rubricItems: effectiveRubricItems,
          solutionCount: solutionImages.length,
          problemText,
          category: gradingCategory,
          paperMode,
          questionDefs: effectiveQuestions,
          scoreUnit,
          scoreScheme: scheme,
        });
        usage = used || {};
      }

      const result = {
        ...normalized,
        demo,
        provider: provider.id,
        providerName: provider.name,
        model,
        elapsedMs: Date.now() - started,
        usage,
        createdAt: new Date().toISOString(),
        category: gradingCategory,
        categoryLabel: categoryLabel(gradingCategory),
        scoreUnit: paperMode ? 1 : scoreUnit,
        paperMode,
        questions: normalized.questions || (paperMode ? effectiveQuestions.map((q) => ({ ...q, score: 0, comment: '' })) : undefined),
        generatedRubric: generatedRubric || undefined,
        rubricPdfUrl: generatedRubric?.pdfUrl,
        rubricPdfName: generatedRubric ? `评分标准-${generatedRubric.title}.pdf` : undefined,
        warnings: warnings.filter((item) => !/演示模式/.test(item)),
      };
      const job = await createJob({
        userId: req.user.id,
        username: req.user.username,
        input: {
          ...body,
          problemText,
          rubricText,
          rubricName: effectiveRubricName,
          rubricItems: effectiveRubricItems,
          rubricQuestions: effectiveQuestions,
          category: gradingCategory,
          scoreUnit,
          paperMode,
          maxScore,
          providerId,
          model,
          strictness,
          studentName,
          sourceLabel,
          rubricId,
          apiKey: undefined,
          baseUrl,
        },
        result,
        providerName: provider.name,
      });
      const publicResult = publicJob(job);
      console.log(`[grade] ${job.id} ${provider.id}/${model} ${normalized.score}/${normalized.maxScore} ${Date.now() - started}ms tokens=${usage.inputTokens || 0}/${usage.outputTokens || 0}`);
      if (demo) warnings.push('演示模式：本次报告未调用真实模型。');
      res.json({ job: publicResult, warnings });
    } finally {
      const count = (activeGrading.get(ip) || 1) - 1;
      if (count <= 0) activeGrading.delete(ip);
      else activeGrading.set(ip, count);
    }
  } catch (error) {
    next(error);
  }
});

if (process.env.NODE_ENV === 'production') {
  const dist = path.join(ROOT, 'dist');
  app.use('/docs', express.static(path.join(ROOT, 'docs'), { maxAge: '1h', index: false }));
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get(/^(?!\/api).*/, async (_req, res, next) => {
    try {
      await fs.access(path.join(dist, 'index.html'));
      res.sendFile(path.join(dist, 'index.html'));
    } catch (error) {
      next(error);
    }
  });
}

app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

app.use((error, _req, res, _next) => {
  const status = error.status && Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) {
    console.error('[server]', error);
  }
  const message =
    status >= 500 && !error.status && !error.expose
      ? '服务器处理失败。请检查模型配置或稍后重试。'
      : error.message || '请求失败';
  res.status(status).json({ error: message });
});

const server = app.listen(PORT, '0.0.0.0', async () => {
  const tex = await texStatus();
  console.log(`墨析服务器已启动：http://127.0.0.1:${PORT}`);
  console.log(`PDF 引擎：${tex.available ? tex.version : '不可用（请安装 XeLaTeX）'}`);
  console.log(`可用服务商：${PROVIDERS.map((item) => item.name).join(' / ')}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
