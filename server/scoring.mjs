export const CATEGORY_LABELS = {
  auto: '自动识别',
  algebra: '代数',
  'number-theory': '数论',
  combinatorics: '组合',
  geometry: '几何',
  cmo: 'CMO',
  'first-exam': '一试',
  other: '其他',
};

export const CATEGORY_HINTS = {
  auto: '由模型根据题面判断题型，再决定评分点。',
  algebra: '代数题：关注变形、估计、取等与变量范围；按得分点给分。',
  'number-theory': '数论题：关注整除、同余、素因子与构造；按得分点给分。',
  combinatorics: '组合题：常分充分性/必要性（构造/证明）两个方向；较简单的构造方向按贡献给部分分。',
  geometry: '几何题：以完整证明链为主；计算未完成时只看已明确证出的几何结论。',
  cmo: 'CMO：每题满分 21 分，严格按 3 分一个得分点；不允许 1 分或非 3 倍数的中间分。',
  'first-exam': '一试：填空只有 0/8；第9题 16 分（4分/点）；第10、11题 20 分（5分/点）。',
  other: '其他题型：按题目实际结构拆分评分点。',
};

const BASE_SCHEMES = [
  { id: 'fill-8', label: '一试填空 · 8分（0/8）', total: 8, unit: 8, mode: 'all-or-nothing', levels: [0, 8], category: 'first-exam' },
  { id: 'sol-16', label: '一试解答 · 16分（4分/点）', total: 16, unit: 4, mode: 'standard', levels: [0, 4, 8, 12, 16], category: 'first-exam' },
  { id: 'sol-20', label: '一试解答 · 20分（5分/点）', total: 20, unit: 5, mode: 'standard', levels: [0, 5, 10, 15, 20], category: 'first-exam' },
  { id: 'prob-40', label: '40分题（10分/点）', total: 40, unit: 10, mode: 'standard', levels: [0, 10, 20, 30, 40] },
  { id: 'prob-50', label: '50分题（10分/点）', total: 50, unit: 10, mode: 'standard', levels: [0, 10, 20, 30, 40, 50] },
  { id: 'cmo-21', label: 'CMO · 21分（3分/点）', total: 21, unit: 3, mode: 'standard', levels: [0, 3, 6, 9, 12, 15, 18, 21] },
  { id: 'imo-7', label: 'IMO · 7分（1分/点）', total: 7, unit: 1, mode: 'standard', levels: [0, 1, 2, 3, 4, 5, 6, 7] },
  { id: 'paper-120', label: '一试整卷 · 120分', total: 120, unit: 1, mode: 'paper', levels: [], category: 'first-exam' },
  { id: 'paper-180', label: '加试整卷 · 180分', total: 180, unit: 1, mode: 'paper', levels: [] },
];

export function getScoreScheme(total, unit, paperMode = false, category = 'other') {
  const n = Number(total);
  const fixed = BASE_SCHEMES.find((scheme) => scheme.total === n && (scheme.mode === 'paper') === Boolean(paperMode));
  if (fixed) return fixed;
  if (paperMode) return { ...BASE_SCHEMES.find((s) => s.mode === 'paper'), total: n, unit: 1, label: `整卷 · ${n}分` };
  const step = Number(unit) > 0 ? Number(unit) : n === 21 ? 3 : n === 7 ? 1 : n === 16 ? 4 : n === 20 ? 5 : 1;
  const levels = [];
  for (let v = 0; v <= n + 0.001; v += step) levels.push(Math.round(v * 10) / 10);
  if (levels[levels.length - 1] !== n) levels.push(n);
  return {
    id: `custom-${n}-${step}`,
    label: `${n}分题（${step}分/点）`,
    total: n,
    unit: step,
    mode: 'standard',
    levels,
    category,
  };
}

export function schemeForQuestion(question) {
  return {
    id: `q-${question.no}`,
    label: `第${question.no}题`,
    total: Number(question.max) || 0,
    unit: Number(question.unit) || 1,
    mode: question.mode || 'standard',
    levels: buildLevels(Number(question.max) || 0, Number(question.unit) || 1, question.mode),
  };
}

export function buildLevels(total, unit, mode = 'standard') {
  if (mode === 'all-or-nothing') return total > 0 ? [0, total] : [0];
  const step = unit > 0 ? unit : 1;
  const levels = [];
  for (let value = 0; value <= total + 0.001; value += step) levels.push(Math.round(value * 10) / 10);
  if (levels[levels.length - 1] !== total) levels.push(total);
  return levels;
}

export function snapScore(value, max, unit, mode = 'standard') {
  const total = Number(max) || 0;
  const n = Math.max(0, Math.min(total, Number(value) || 0));
  if (mode === 'all-or-nothing') return n >= total / 2 ? total : 0;
  const levels = buildLevels(total, unit, mode).filter((level) => level <= total + 0.001);
  if (!levels.length) return n;
  return levels.reduce((best, level) => (Math.abs(level - n) < Math.abs(best - n) ? level : best), levels[0]);
}

export function categoryLabel(category) {
  return CATEGORY_LABELS[category] || CATEGORY_LABELS.other;
}

export function schemePromptText(scheme) {
  if (scheme.mode === 'paper') {
    return '整卷模式：按题号逐题给分，每题的分数单位见题目结构表。';
  }
  if (scheme.mode === 'all-or-nothing') {
    return `本题满分 ${scheme.total} 分，只能给 0 分或 ${scheme.total} 分，没有中间分。`;
  }
  return `本题满分 ${scheme.total} 分，每个得分点 ${scheme.unit} 分；允许的分数档为 ${scheme.levels.join('、')}。`;
}

export function normalizePaperQuestions(defs = []) {
  return (Array.isArray(defs) ? defs : []).map((item, index) => ({
    no: String(item.no ?? index + 1),
    type: String(item.type || '解答'),
    max: Number(item.max) || 0,
    unit: Number(item.unit) || 1,
    mode: item.mode === 'all-or-nothing' ? 'all-or-nothing' : 'standard',
    topic: String(item.topic || ''),
  }));
}
