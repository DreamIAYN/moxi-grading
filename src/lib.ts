import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type {
  AppConfig,
  ProviderInfo,
  RubricTemplate,
  StoredSettings,
  UploadImage,
} from './types';

export const BUILTIN_RUBRICS: RubricTemplate[] = [
  {
    id: 'auto',
    name: '自动研判',
    scope: '通用 · 由 AI 拆解步骤分',
    total: 12,
    unit: 1,
    category: 'auto',
    description: '不预设固定分值结构。AI 根据题目难度与解答长度，自行拆解可核查的评分点，并在报告中列明。',
    items: [],
    builtin: true,
  },
  {
    id: 'gaolian-2',
    name: '高联二试 · 单题',
    scope: '中国高中数学联赛 · 加试',
    total: 40,
    unit: 10,
    category: 'other',
    description: '强调完整证明链。关键引理与构造占主要分值，允许在局部跳步时保留思路分。',
    items: [
      { name: '思路与入口', max: 8, description: '选择正确的方法、构造或转化方向。' },
      { name: '关键引理与结构', max: 12, description: '核心引理、辅助线、不变量或构造是否成立。' },
      { name: '主论证与推导', max: 14, description: '从关键步骤推进到结论，逻辑链是否闭合。' },
      { name: '严谨性与书写', max: 6, description: '边界、等号条件、分类讨论与表述规范。' },
    ],
    builtin: true,
  },
  {
    id: 'gaolian-1',
    name: '高联一试 · 解答题',
    scope: '中国高中数学联赛 · 一试',
    total: 16,
    unit: 4,
    category: 'first-exam',
    description: '重视结果正确与过程可复核。运算错误与范围遗漏按步骤扣分。',
    items: [
      { name: '思路与建模', max: 3, description: '式子变形、几何关系或计数框架是否正确。' },
      { name: '运算与推导', max: 6, description: '关键运算、代换与分类讨论。' },
      { name: '结论与验证', max: 5, description: '最终结果、取值范围与等号条件。' },
      { name: '书写规范', max: 2, description: '步骤完整、符号清晰、结论明确。' },
    ],
    builtin: true,
  },
  {
    id: 'cmo',
    name: 'CMO · 单题',
    scope: '中国数学奥林匹克',
    total: 21,
    unit: 3,
    category: 'other',
    description: '按完整证明的完成度给分，严重跳步即使结论正确也只给部分分。',
    items: [
      { name: '总体思路', max: 5, description: '路线是否自然、可行，是否抓住题目结构。' },
      { name: '关键步骤', max: 8, description: '核心引理、构造、估计或分类是否完成。' },
      { name: '完成论证', max: 6, description: '是否排除所有情形并真正推出结论。' },
      { name: '严谨与书写', max: 2, description: '量词、边界、退化情形与表述。' },
    ],
    builtin: true,
  },
  {
    id: 'imo',
    name: 'IMO · 单题',
    scope: '国际数学奥林匹克',
    total: 7,
    unit: 1,
    category: 'other',
    description: '七分制。0–1 分为方向性进展，2–5 分为实质性部分结果，6–7 分为完整证明。',
    items: [
      { name: '策略与方向', max: 1, description: '有价值的观察或正确的总体路线。' },
      { name: '关键引理', max: 2, description: '实质性的中间结果或构造。' },
      { name: '论证完成度', max: 3, description: '主要情形、归纳或估计是否闭合。' },
      { name: '严谨性', max: 1, description: '所有边界与等号情形。' },
    ],
    builtin: true,
  },

  {
    id: 'first-fill-8',
    name: '一试 · 填空（8分）',
    scope: '2026 高联 A 卷 · 一试填空',
    total: 8,
    unit: 8,
    mode: 'all-or-nothing',
    category: 'first-exam',
    official: true,
    source: '2026 高联 A 卷评分标准说明',
    description: '填空题只有 0 分或 8 分，没有中间分；只看最终答案是否正确。',
    items: [{ name: '最终答案', max: 8, description: '答案正确得 8 分，否则 0 分。' }],
    partialRules: [],
    builtin: true,
  },
  {
    id: 'first-2026-q9',
    name: '2026 A · 一试第9题',
    scope: '16 分 · 4 分/点',
    total: 16,
    unit: 4,
    category: 'first-exam',
    official: true,
    source: '2026 一试 A 卷参考答案及评分标准 / 评分标准说明',
    description: '完整证明 C ≥ 2√2/5 得 12 分；指出取等条件得 4 分。只写出最小值不得分。',
    items: [
      { name: 'A. 完整证明 C ≥ 2√2/5', max: 12, description: '由 log2 y = 2log4 y，将 5C 化为 2^x + 2·2^{-x}，用基本不等式完成下界。', anchors: [{ points: 12, condition: '完整证明下界' }, { points: 4, condition: 'A1：指出换元/对数关系' }] },
      { name: 'B. 取等条件', max: 4, description: '说明 C 可取到 2√2/5，并指出 x、2^x、2^{-x}、y、log2 y 或 log4 y 中至少一个取值。' },
    ],
    partialRules: [
      { label: 'A1', points: 4, note: '指出 log2 y = 2log4 y，或换元 t=log2 y 并把 log4 y 视为 t/2；仅在 A 不完整时给。', exclusive: true },
    ],
    builtin: true,
  },
  {
    id: 'first-2026-q10',
    name: '2026 A · 一试第10题',
    scope: '20 分 · 5 分/点',
    total: 20,
    unit: 5,
    category: 'first-exam',
    official: true,
    source: '2026 一试 A 卷参考答案及评分标准 / 评分标准说明',
    description: '证明 sinθ=1/3 得 10 分；说明最大个数 n=9 得 10 分。',
    items: [
      { name: 'A. 证明 sinθ = 1/3', max: 10, description: '求出小铜球半径 r=1/4（5分），再得到 sinθ=1/3；等价角度描述亦可。', anchors: [{ points: 5, condition: 'A1：证明 r=1/4' }, { points: 10, condition: '完成 sinθ=1/3 或等价角度关系' }] },
      { name: 'B. 最大个数 n=9', max: 10, description: 'B1：θ<π/9（等价 n≥9）5分；B2：θ>π/10（等价 n<10）5分。', anchors: [{ points: 5, condition: 'B1：θ<π/9 或 n≥9' }, { points: 10, condition: 'B2：θ>π/10 或 n<10' }] },
    ],
    partialRules: [
      { label: 'A1', points: 5, note: '证明 r=1/4；仅在 A 不完整时给。', exclusive: true },
      { label: 'B1', points: 5, note: '证明 θ<π/9 或 n≥9；可与 B2 叠加。', exclusive: false },
      { label: 'B2', points: 5, note: '证明 θ>π/10 或 n<10；可与 B1 叠加。', exclusive: false },
    ],
    builtin: true,
  },
  {
    id: 'first-2026-q11',
    name: '2026 A · 一试第11题',
    scope: '20 分 · 5 分/点',
    total: 20,
    unit: 5,
    category: 'first-exam',
    official: true,
    source: '2026 一试 A 卷参考答案及评分标准 / 评分标准说明',
    description: '证明 m≥512 得 15 分；证明 512-有趣数列有 8 个得 5 分。',
    items: [
      { name: 'A. 证明 m ≥ 512', max: 15, description: '得到等比数列相邻差的比例关系，证明公比 q 为有理数，并估计 m 的下界。', anchors: [{ points: 5, condition: 'A1：写出 q 的连比关系' }, { points: 15, condition: '完成 m≥512' }] },
      { name: 'B. 证明恰有 8 个', max: 5, description: '给出 512-有趣数列的 8 种取值（可只给出 a_{2^i} 的正确取值）。' },
    ],
    partialRules: [
      { label: 'A1', points: 5, note: '指出 (a_{i3}-a_{i2})/(a_{i2}-a_{i1})=…=q；仅在 A 不完整时给。', exclusive: true },
      { label: 'AB', points: 5, note: '若 A 未完成，但正确给出 8 种 512-有趣数列，可视为完成 B。', exclusive: false },
    ],
    builtin: true,
  },
  {
    id: 'first-2026-full',
    name: '2026 A · 一试整卷',
    scope: '120 分 · 8 填空 + 3 解答',
    total: 120,
    unit: 1,
    mode: 'paper',
    category: 'first-exam',
    official: true,
    source: '2026 高联 A 卷评分标准说明',
    description: '填空 8×8=64；第9题 16 分（4分/点）；第10、11题各 20 分（5分/点）。填空只给 0/8。',
    items: [
      { name: '第1–8题（填空）', max: 64, description: '每题 8 分，只有 0/8。' },
      { name: '第9题', max: 16, description: '4 分一个得分点。' },
      { name: '第10题', max: 20, description: '5 分一个得分点。' },
      { name: '第11题', max: 20, description: '5 分一个得分点。' },
    ],
    questions: [
      ...Array.from({ length: 8 }, (_, i) => ({ no: String(i + 1), type: '填空', max: 8, unit: 8, mode: 'all-or-nothing' as const, topic: '一试填空' })),
      { no: '9', type: '解答', max: 16, unit: 4, mode: 'standard' as const, topic: '代数' },
      { no: '10', type: '解答', max: 20, unit: 5, mode: 'standard' as const, topic: '几何/立体' },
      { no: '11', type: '解答', max: 20, unit: 5, mode: 'standard' as const, topic: '组合/数列' },
    ],
    partialRules: [],
    builtin: true,
  },
  {
    id: 'extra-2026-t1',
    name: '2026 A · 加试第1题',
    scope: '40 分 · 10 分/点',
    total: 40,
    unit: 10,
    category: 'number-theory',
    official: true,
    source: '2026 加试 A 卷参考答案及评分标准 / 评分标准说明',
    description: '指出 m=4 且给出满足条件的 n 得 10 分；完整证明 m=4 得 30 分。',
    items: [
      { name: 'A. 构造 m=4 的例子', max: 10, description: '给出满足条件的 n（如 6、15、91），只需给出 n。' },
      { name: 'B. 证明 m 只能为 4', max: 30, description: '证明 n=pq，p、2p-1 为素数，并完成整除/估计。' },
    ],
    partialRules: [
      { label: 'B1', points: 10, note: '证明 n 无平方因子。', exclusive: true },
      { label: 'B2', points: 10, note: '证明若 p 是 n 的最小素因子，则 2p-1 为素数。', exclusive: true },
      { label: 'B3', points: 10, note: '证明 (1+n/p)/2 整除 n。', exclusive: true },
      { label: 'B4', points: 10, note: '证明 (p+n/p)/2 整除 n。', exclusive: true },
    ],
    builtin: true,
  },
  {
    id: 'extra-2026-t2',
    name: '2026 A · 加试第2题',
    scope: '40 分 · 10 分/点',
    total: 40,
    unit: 10,
    category: 'geometry',
    official: true,
    source: '2026 加试 A 卷参考答案及评分标准 / 评分标准说明',
    description: '完整证明 40 分；基本正确但有小错误可扣 10 分。',
    items: [
      { name: 'A. 建立共圆/相似结构', max: 10, description: '取 AP 中点 X，证明 P,X,N,D 共圆，或等价的几何关系。' },
      { name: 'B. 完成相似与相切', max: 30, description: '证明 △AOP 与 △DNX 相似，推出 ∠AOP=∠APB，完成相切。' },
    ],
    partialRules: [
      { label: '小瑕疵', points: -10, note: '几乎完整、仅有可简单修改的错误时，在满分基础上扣 10 分。', exclusive: false },
    ],
    builtin: true,
  },
  {
    id: 'extra-2026-t3',
    name: '2026 A · 加试第3题',
    scope: '50 分 · 10 分/点',
    total: 50,
    unit: 10,
    category: 'algebra',
    official: true,
    source: '2026 加试 A 卷参考答案及评分标准 / 评分标准说明',
    description: '正确 50 分；基本正确有小错误可扣 10 分。完成结论(1)或等价部分得 10 分，P 类平均估计另得 20 分。',
    items: [
      { name: 'A. 结论(1)或等价部分', max: 10, description: '证明 a1+…+a_{n-1}≤n-1，或证明 ai+a_{n-i}≤2 等三种情况之一。' },
      { name: 'B. 主估计', max: 20, description: '证明形如“若干 ai 的平均值 ≤ 1−f(a0)”的估计。' },
      { name: 'C. 完成结论(2)', max: 20, description: '由估计推出 a0+…+a_{n-1}≤n。' },
    ],
    partialRules: [
      { label: 'P', points: 20, note: '证明一个形如“某些 ai 的平均值≤1−f(a0)”的不等式，可与 A 的 10 分叠加。', exclusive: false },
    ],
    builtin: true,
  },
  {
    id: 'extra-2026-t4',
    name: '2026 A · 加试第4题',
    scope: '50 分 · 10 分/点',
    total: 50,
    unit: 10,
    category: 'combinatorics',
    official: true,
    source: '2026 加试 A 卷参考答案及评分标准 / 评分标准说明',
    description: '奇数 n 的构造与下界 10 分；偶数 n 的构造、验证、下界共 40 分。',
    items: [
      { name: 'M. 奇数 n 的情形', max: 10, description: '必须同时证明下界 ≥n−1 并给出达到 n−1 的构造；缺一不得分。' },
      { name: 'P1. 偶数 n 的构造', max: 10, description: '给出达到 4k²/(2k+1) 的填数。' },
      { name: 'P2. 验证构造', max: 10, description: '验证每个 S 形内的和均不小于 1。' },
      { name: 'P3. 偶数 n 的下界', max: 20, description: '证明任意填法之和 ≥4k²/(2k+1)。' },
    ],
    partialRules: [
      { label: 'C4', points: 10, note: '完成 4×4 方格表的构造与证明；与 P 不叠加，可与 M 叠加。', exclusive: true },
      { label: 'C6', points: 20, note: '完成 4×6 方格表的构造与证明；与 P 不叠加，可与 M 叠加。', exclusive: true },
    ],
    builtin: true,
  },
  {
    id: 'extra-2026-full',
    name: '2026 A · 加试整卷',
    scope: '180 分 · 4 道解答题',
    total: 180,
    unit: 1,
    mode: 'paper',
    category: 'other',
    official: true,
    source: '2026 加试 A 卷参考答案及评分标准',
    description: '第1、2题各 40 分（10分/点）；第3、4题各 50 分（10分/点）。按题逐项给分。',
    items: [
      { name: '第1题（40分）', max: 40 },
      { name: '第2题（40分）', max: 40 },
      { name: '第3题（50分）', max: 50 },
      { name: '第4题（50分）', max: 50 },
    ],
    questions: [
      { no: '1', type: '解答', max: 40, unit: 10, mode: 'standard', topic: '数论' },
      { no: '2', type: '解答', max: 40, unit: 10, mode: 'standard', topic: '几何' },
      { no: '3', type: '解答', max: 50, unit: 10, mode: 'standard', topic: '代数' },
      { no: '4', type: '解答', max: 50, unit: 10, mode: 'standard', topic: '组合' },
    ],
    partialRules: [],
    builtin: true,
  },
];

export const STRICTNESS_LABELS: Record<string, string> = {
  standard: '标准',
  strict: '从严',
  encouraging: '鼓励',
};

export const SEVERITY_META = {
  correct: { label: '成立', color: '#2f6b4f', bg: '#e7f0e8' },
  error: { label: '错误', color: '#b23a2c', bg: '#f8e5df' },
  warning: { label: '待补', color: '#a56a16', bg: '#f6ecd8' },
  info: { label: '提示', color: '#315c86', bg: '#e6edf4' },
} as const;

const SETTINGS_KEY = 'moxi.settings.v2';
const RUBRICS_KEY = 'moxi.rubrics.v2';
const DEFAULT_RUBRIC_KEY = 'moxi.defaultRubric.v2';

export const DEFAULT_SETTINGS: StoredSettings = {
  providerId: 'opencode',
  model: 'glm-5.3-flash',
  apiKeys: {},
  baseUrls: {},
  customModel: '',
  strictness: 'standard',
  studentName: '',
  graderName: '',
};

export function loadSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: StoredSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadCustomRubrics(): RubricTemplate[] {
  try {
    const raw = localStorage.getItem(RUBRICS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomRubrics(rubrics: RubricTemplate[]) {
  localStorage.setItem(RUBRICS_KEY, JSON.stringify(rubrics.filter((r) => !r.builtin)));
}

export function getAllRubrics(): RubricTemplate[] {
  return [...BUILTIN_RUBRICS, ...loadCustomRubrics()];
}

export function loadDefaultRubricId(): string {
  return localStorage.getItem(DEFAULT_RUBRIC_KEY) || 'auto';
}

export function saveDefaultRubricId(id: string) {
  localStorage.setItem(DEFAULT_RUBRIC_KEY, id);
}

export function formatDate(iso: string, withTime = true) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  if (!withTime) return date;
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

export function newId(prefix = '') {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}${id}`;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

export async function fileToUploadImage(file: File, maxEdge = 1800): Promise<UploadImage> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
  if (file.size > 25 * 1024 * 1024) throw new Error('单张图片不能超过 25MB');
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持图片处理');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return {
    id: newId(),
    dataUrl: canvas.toDataURL('image/jpeg', 0.9),
    name: file.name.replace(/\.[^.]+$/, '') || '解答页',
    width: canvas.width,
    height: canvas.height,
  };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片无法解码，请改用 JPG / PNG 格式'));
    img.src = src;
  });
}

export async function rotateImage(image: UploadImage, degrees = 90): Promise<UploadImage> {
  const img = await loadImage(image.dataUrl);
  const canvas = document.createElement('canvas');
  const swap = Math.abs(degrees) % 180 === 90;
  canvas.width = swap ? img.naturalHeight : img.naturalWidth;
  canvas.height = swap ? img.naturalWidth : img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return image;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return {
    ...image,
    width: canvas.width,
    height: canvas.height,
    dataUrl: canvas.toDataURL('image/jpeg', 0.9),
  };
}

export const FALLBACK_PROVIDERS: ProviderInfo[] = [
  {
    id: 'demo',
    name: '演示模式',
    short: 'DEMO',
    baseUrl: '',
    protocol: 'mock',
    envKey: '',
    serverKeyConfigured: true,
    models: [{ id: 'demo', label: '内置示例阅卷人', vision: true, note: '不调用外部模型' }],
    docs: '',
    accent: '#8a7a5c',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    short: 'DS',
    baseUrl: 'https://api.deepseek.com',
    protocol: 'OpenAI Chat Completions',
    envKey: 'DEEPSEEK_API_KEY',
    serverKeyConfigured: false,
    models: [
      { id: 'deepseek-flash', label: 'DeepSeek V4.1 Flash', vision: true, note: '支持图像；默认思考，速度优先选 GLM-5.3 Flash' },
      { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', vision: false, note: '纯文本，适合已转写的解答' },
    ],
    docs: 'https://api-docs.deepseek.com/zh-cn/',
    accent: '#365b7e',
  },
  {
    id: 'bigmodel',
    name: '智谱 BigModel',
    short: 'GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    protocol: 'OpenAI Chat Completions',
    envKey: 'BIGMODEL_API_KEY',
    serverKeyConfigured: false,
    models: [
      { id: 'glm-4.6v', label: 'GLM-4.6V', vision: true, note: '视觉推理，手写识别推荐' },
      { id: 'glm-4.6v-flash', label: 'GLM-4.6V Flash', vision: true, note: '轻量免费，速度优先' },
      { id: 'glm-5.3', label: 'GLM-5.3', vision: false, note: '纯文本强推理' },
    ],
    docs: 'https://docs.bigmodel.cn/',
    accent: '#2f6b4f',
  },
  {
    id: 'opencode',
    name: 'OpenCode Zen',
    short: 'ZEN',
    baseUrl: 'https://opencode.ai/zen/v1',
    protocol: 'OpenAI 兼容端点',
    envKey: 'OPENCODE_API_KEY',
    serverKeyConfigured: false,
    models: [
      { id: 'glm-5.3-flash', label: 'GLM-5.3 Flash via Zen', vision: true, note: '视觉 · thinking 已启用（low）' },
      { id: 'glm-5.3', label: 'GLM-5.3 via Zen', vision: false, note: '纯文本强推理' },
      { id: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash via Zen', vision: true, note: '推理型，通常比 GLM 慢；速度优先选 GLM-5.3 Flash' },
      { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro via Zen', vision: false },
    ],
    docs: 'https://opencode.ai/docs/zen',
    accent: '#6b4c7a',
  },
];

export async function fetchConfig(): Promise<AppConfig> {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('无法读取服务配置');
  return res.json();
}

export function totalCriteria(items: { max: number }[]) {
  return items.reduce((sum, item) => sum + (Number(item.max) || 0), 0);
}

export function scoreTone(ratio: number) {
  if (ratio >= 0.85) return { label: '优秀', color: '#2f6b4f' };
  if (ratio >= 0.7) return { label: '良好', color: '#3d6f56' };
  if (ratio >= 0.5) return { label: '部分完成', color: '#a56a16' };
  return { label: '需要加强', color: '#b23a2c' };
}

export const CATEGORY_LABELS: Record<string, string> = {
  auto: '自动识别',
  algebra: '代数',
  'number-theory': '数论',
  combinatorics: '组合',
  geometry: '几何',
  cmo: 'CMO',
  'first-exam': '一试',
  other: '其他',
};

export const CATEGORY_OPTIONS = [
  { id: 'auto', label: '自动识别' },
  { id: 'algebra', label: '代数' },
  { id: 'number-theory', label: '数论' },
  { id: 'combinatorics', label: '组合' },
  { id: 'geometry', label: '几何' },
  { id: 'cmo', label: 'CMO' },
  { id: 'first-exam', label: '一试' },
  { id: 'other', label: '其他' },
] as const;

export const SCORE_SCHEMES = [
  { id: 'fill-8', label: '一试填空 · 8分', total: 8, unit: 8, mode: 'all-or-nothing' as const, levels: [0, 8], category: 'first-exam' },
  { id: 'sol-16', label: '一试解答 · 16分', total: 16, unit: 4, mode: 'standard' as const, levels: [0, 4, 8, 12, 16], category: 'first-exam' },
  { id: 'sol-20', label: '一试解答 · 20分', total: 20, unit: 5, mode: 'standard' as const, levels: [0, 5, 10, 15, 20], category: 'first-exam' },
  { id: 'prob-40', label: '40分题 · 10分/点', total: 40, unit: 10, mode: 'standard' as const, levels: [0, 10, 20, 30, 40] },
  { id: 'prob-50', label: '50分题 · 10分/点', total: 50, unit: 10, mode: 'standard' as const, levels: [0, 10, 20, 30, 40, 50] },
  { id: 'cmo-21', label: 'CMO · 21分 · 3分/点', total: 21, unit: 3, mode: 'standard' as const, levels: [0, 3, 6, 9, 12, 15, 18, 21] },
  { id: 'imo-7', label: 'IMO · 7分 · 1分/点', total: 7, unit: 1, mode: 'standard' as const, levels: [0, 1, 2, 3, 4, 5, 6, 7] },
  { id: 'paper-120', label: '一试整卷 · 120分', total: 120, unit: 1, mode: 'paper' as const, levels: [], category: 'first-exam' },
  { id: 'paper-180', label: '加试整卷 · 180分', total: 180, unit: 1, mode: 'paper' as const, levels: [] },
];

export function buildLevels(total: number, unit: number, mode: string = 'standard') {
  if (mode === 'all-or-nothing') return total > 0 ? [0, total] : [0];
  const step = unit > 0 ? unit : 1;
  const levels: number[] = [];
  for (let value = 0; value <= total + 0.001; value += step) levels.push(Math.round(value * 10) / 10);
  if (levels[levels.length - 1] !== total) levels.push(total);
  return levels;
}

export function getScoreScheme(total: number, unit?: number, paperMode = false) {
  const n = Number(total) || 0;
  const fixed = SCORE_SCHEMES.find((scheme) => scheme.total === n && (scheme.mode === 'paper') === paperMode);
  if (fixed) return fixed;
  if (paperMode) return { id: 'custom-paper', label: `整卷 · ${n}分`, total: n, unit: 1, mode: 'paper' as const, levels: [] };
  const step = unit && unit > 0 ? unit : n === 21 ? 3 : n === 7 ? 1 : n === 16 ? 4 : n === 20 ? 5 : 1;
  return {
    id: `custom-${n}-${step}`,
    label: `${n}分题 · ${step}分/点`,
    total: n,
    unit: step,
    mode: 'standard' as const,
    levels: buildLevels(n, step),
  };
}

export function snapScore(value: number, max: number, unit: number, mode = 'standard') {
  const total = Math.max(0, Number(max) || 0);
  const n = Math.max(0, Math.min(total, Number(value) || 0));
  if (mode === 'all-or-nothing') return n >= total / 2 ? total : 0;
  const levels = buildLevels(total, unit, mode).slice().sort((a, b) => a - b);
  return levels.reduce((best, level) => (Math.abs(level - n) < Math.abs(best - n) ? level : best), levels[0] ?? 0);
}

export function categoryLabel(category?: string) {
  return CATEGORY_LABELS[category || 'other'] || CATEGORY_LABELS.other;
}

export async function pdfToUploadImages(file: File, maxPages = 12): Promise<UploadImage[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({
    data,
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    useSystemFonts: true,
  });
  const doc = await task.promise;
  const pages: UploadImage[] = [];
  const count = Math.min(doc.numPages, maxPages);
  try {
    for (let pageNo = 1; pageNo <= count; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.4, 1800 / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('浏览器不支持 PDF 渲染');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      pages.push({
        id: newId(),
        dataUrl: canvas.toDataURL('image/jpeg', 0.9),
        name: `${file.name.replace(/\.pdf$/i, '')} · 第${pageNo}页`,
        width: canvas.width,
        height: canvas.height,
      });
    }
  } finally {
    await task.destroy();
  }
  return pages;
}
