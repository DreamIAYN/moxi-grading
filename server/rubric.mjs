import { parseJsonPayload } from './grading.mjs';
import { SOLVING_SKILL_POLICY } from './skill-policy.mjs';
import {
  CATEGORY_HINTS,
  CATEGORY_LABELS,
  categoryLabel,
  getScoreScheme,
  normalizePaperQuestions,
  schemePromptText,
  snapScore,
} from './scoring.mjs';

export const RUBRIC_SYSTEM_PROMPT = `你是一位数学竞赛命题组阅卷负责人。现在还没有正式评分，你的任务是：在评分前为这道题（或这份整卷）制定一份可执行的评分标准，并输出 JSON 供系统生成 PDF。

【原则】
1. **不要独立解题，不要生成参考解。** 先逐页阅读学生解答，按学生实际写出的思路重建解题路线，再拆评分点。
2. 评分点必须可核查：每一档对应一个明确的数学进展或结论，不能写“过程完整”“思路清晰”这类空话。
3. 分数必须符合给定的总分、得分点单位和允许档位；每个评分点的满分也必须是得分单位的整数倍。
4. **实质给分门禁（最高优先级）**：每个得分点必须对应一个可独立核验的数学子结论、完整方向或完整构造；不得设置“思路正确”“方法正确”“有想法”“有尝试”“书写认真”这类过程分。正确思路只有在转化为正确的中间结论/构造/方向证明后才可给分。
5. **零分情形**：只写最终答案（填空除外）、只有思路或方法名、只写设元/开头/框架、结论错误且没有任何独立成立的实质子结论、用“显然/易知”跳过关键步骤——均不得分。步骤多、篇幅长、态度好都不构成得分理由。
6. 区分“平凡的结论”和“真正推进结论的步骤”。只完成较简单方向（例如组合题中的构造）时，按实际贡献给部分分，通常约为总分的一个较低档（如 20/50、10/40、6/21、2/7 这种量级，具体按题目难度决定），不要自动给一半或满分。
7. 若一道题分为充分性/必要性、构造/证明两个方向，评分点应明确对应这两个方向；较容易的方向只拿其应得的部分分。
8. 部分分规则要写清楚是否可叠加、是否只在主项未完成时生效，避免重复给分。
9. 按下面的学生路线规范核验并制定评分标准。
10. **评分标准必须贴合学生路线**：学生解答随后按页提供。用 studentRoute 记录学生实际路线、成立的步骤与逐评分点映射；不要写参考解，不要把“你偏好的解法”设为必得分点。
    - 学生路线正确时，评分点应让这条路线能拿到满分。
    - 学生路线有错时，status 记 partial/invalid；只把学生路线上数学上成立、可独立核验的实质子结论设为得分点，错误步骤本身 0 分。
    - 用 criterionMap 逐项给出学生证据与 full/partial/none。

${SOLVING_SKILL_POLICY}

11. **引用定理核验**：列出学生在解答中引用的所有命名定理、引理或外部结论。你确定其陈述无误时 known=true；不确定时必须 known=false，并给出适合搜索引擎的 searchQuery（尽量用定理的标准名称）。系统会联网查找并把结果交给评分步骤；找不到的按证明不完整处理。
12. 只输出一个合法 JSON 对象，不要 Markdown 代码围栏或解释。

【JSON 结构】
{
  "title": "本题评分标准标题",
  "category": "algebra | number-theory | combinatorics | geometry | cmo | first-exam | other",
  "summary": "评分总则，说明本题的关键得分结构与阅卷尺度",
  "criteria": [
    {
      "name": "评分点名称",
      "max": 数字,
      "description": "这一项看什么、达到什么程度给满分",
      "anchors": [{ "points": 数字, "condition": "得该分数的具体条件" }]
    }
  ],
  "partialRules": [
    { "label": "A1", "points": 数字, "note": "具体条件", "exclusive": true }
  ],
  "studentRoute": {
    "status": "valid | partial | invalid",
    "summary": "学生实际路线的数学实质与是否成立",
    "routeSolution": "按学生实际思路重述/补全其路线，不换成你的解法",
    "acceptedSteps": ["学生路线中数学上成立、可独立核验的步骤/子结论"],
    "criterionMap": [
      { "criterion": "对应评分点名称", "studentEvidence": "学生路线中的对应步骤", "credit": "full | partial | none", "note": "为什么给这个档" }
    ],
    "scoringNote": "按学生路线如何给分；不在学生路线上的步骤不作为必得分点"
  },
  "citedResults": [
    {
      "name": "学生引用的定理/引理名称",
      "statement": "学生实际使用的陈述（含条件）",
      "known": true,
      "searchQuery": "不确定时用于联网核验的查询词",
      "whyNeeded": "它在学生路线中支撑哪一步"
    }
  ],
  "triviality": "说明本题哪些结论较平凡、哪些步骤才算实质进展，以及部分分如何按此判断",
  "zeroConditions": [
    "只写最终答案，没有任何可核验推导（填空除外）",
    "只有正确思路/方法名/开头/框架，但没有得到任何正确结论",
    "结论错误且没有独立成立的实质中间结论"
  ]
}`;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundHalf(value) {
  return Math.round(value * 2) / 2;
}

function asNumber(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function clean(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function studentFacing(value, fallback = '') {
  return clean(value, fallback)
    .replace(/\bexclusive\b/gi, '不叠加')
    .replace(/\bcriteria\b/gi, '评分点')
    .replace(/\bpartialRules\b/gi, '部分分')
    .replace(/\bJSON\b/g, '')
    .trim();
}

export function sanitizeTemplate(input) {
  if (!input || typeof input !== 'object') return null;
  const items = Array.isArray(input.items)
    ? input.items.slice(0, 24).map((item) => {
        const anchors = Array.isArray(item?.anchors)
          ? item.anchors.slice(0, 8).map((anchor) => ({
              points: asNumber(anchor?.points, 0),
              condition: clean(anchor?.condition, '').slice(0, 500),
            }))
          : [];
        return {
          name: clean(item?.name, '评分点').slice(0, 100),
          max: Math.max(0, asNumber(item?.max, 0)),
          description: clean(item?.description, '').slice(0, 1200),
          anchors,
        };
      })
    : [];
  const questions = normalizePaperQuestions(
    Array.isArray(input.questions) ? input.questions.slice(0, 30) : [],
  );
  const partialRules = Array.isArray(input.partialRules)
    ? input.partialRules.slice(0, 30).map((rule) => ({
        label: studentFacing(rule?.label, '部分分').slice(0, 40),
        points: asNumber(rule?.points, 0),
        note: studentFacing(rule?.note, '').slice(0, 800),
        exclusive: Boolean(rule?.exclusive),
      }))
    : [];
  return {
    id: clean(input.id, 'custom'),
    name: clean(input.name, '自定义评分标准').slice(0, 120),
    scope: clean(input.scope, '').slice(0, 120),
    total: Math.max(0, asNumber(input.total, 0)),
    description: clean(input.description, '').slice(0, 1500),
    items,
    questions,
    partialRules,
    category: CATEGORY_LABELS[input.category] ? input.category : 'other',
    unit: Math.max(0, asNumber(input.unit, 0)),
    mode: input.mode === 'paper' || input.mode === 'all-or-nothing' ? input.mode : (questions.length ? 'paper' : 'standard'),
    official: Boolean(input.official),
    source: clean(input.source, '').slice(0, 300),
    levels: Array.isArray(input.levels) ? input.levels.slice(0, 40).map((v) => asNumber(v, 0)) : [],
  };
}

function categoryTriviality(category) {
  if (category === 'combinatorics') {
    return '组合题通常分构造与证明两个方向。若题目要求“存在性 + 满足条件”，只给出正确构造通常只能拿较低档部分分（例如 50 分题的 20 分、40 分题的 10 分、21 分题的 6 分、7 分题的 2 分这一量级，具体按构造难度调整）；必须说明构造为何满足全部条件，才可再拿验证分。反向的不可能性/必要性证明按关键引理与完成度给分。';
  }
  if (category === 'geometry') {
    return '几何题以完整证明链为主。先看是否建立了正确的辅助线、共圆/相似/相切结构；只写出显然的角度或长度关系属于平凡步骤，不给主要分。计算未完成时，只看是否明确证出有用的几何结论。';
  }
  if (category === 'number-theory') {
    return '数论题先判断哪些结论只是定义或直接变形。素因子分析、整除构造、同余不变量等真正推进结论的步骤给主要分；仅举一个例子通常只给构造分。';
  }
  if (category === 'algebra') {
    return '代数题先判断哪些变形只是例行化简。真正推进结论的估计、变量代换、取等分析与分类讨论给主要分；只完成一个方向或只验证特例按部分分处理。';
  }
  if (category === 'first-exam') {
    return '一试填空只有 0/8，不给中间分。解答题按 4 分或 5 分一个得分点；只写出正确最终答案但无过程，不能替代关键得分点。';
  }
  return '先判断每一步是否只是平凡变形、直接套用定义或重复题设。真正推进结论的关键构造、估计与分类讨论才给主要分；只完成较简单的方向时按实际贡献给部分分。';
}

export function buildRubricText(rubric) {
  const criteria = (rubric.criteria || [])
    .map((item, index) => `${index + 1}. ${item.name}（${item.max} 分）${item.description ? `：${item.description}` : ''}`)
    .join('\n');
  const rules = (rubric.partialRules || []).length
    ? `\n部分分规则：\n${rubric.partialRules.map((rule) => `- ${rule.label}（${rule.points > 0 ? '+' : ''}${rule.points} 分）${rule.exclusive ? '（不叠加）' : ''}：${rule.note}`).join('\n')}`
    : '';
  const zeros = (rubric.zeroConditions || []).length
    ? `\n零分情形（不因思路正确、步骤多或书写认真给分）：\n${rubric.zeroConditions.map((item) => `- ${item}`).join('\n')}`
    : '\n零分情形：只写答案、只有思路/框架、结论错误且无实质子结论，均不给分。';
  const route = rubric.studentRoute
    ? `\n学生路线（${rubric.studentRoute.status || 'partial'}）：${rubric.studentRoute.summary || ''}\n按学生思路重述：${rubric.studentRoute.routeSolution || '（略）'}\n可接受步骤：${(rubric.studentRoute.acceptedSteps || []).join('；') || '（略）'}\n给分映射：${rubric.studentRoute.scoringNote || '（略）'}`
    : '';
  return `满分 ${rubric.total} 分；${rubric.unit ? `${rubric.unit} 分一个得分点；` : ''}${rubric.summary || ''}\n评分点：\n${criteria}${rules}${zeros}${route}`;
}

export function templateToRubric(template, ctx) {
  const questions = template.questions || [];
  const criteria = questions.length
    ? questions.map((question) => ({
        name: `第${question.no}题（${question.type}${question.topic && !question.topic.includes(question.type) ? ` · ${question.topic}` : ''}）`,
        max: question.max,
        description: question.mode === 'all-or-nothing'
          ? '填空：只有 0 分或满分，不给中间分。'
          : `${question.unit} 分一个得分点；允许档位 ${Array.from({ length: Math.floor(question.max / question.unit) + 1 }, (_, i) => i * question.unit).join(' / ')}。`,
        anchors: [],
      }))
    : template.items.map((item) => ({
        name: item.name,
        max: item.max,
        description: item.description || '',
        anchors: item.anchors || [],
      }));
  const total = ctx.total || template.total;
  const unit = ctx.unit || template.unit || (template.mode === 'paper' ? 1 : 1);
  return {
    title: template.name,
    category: template.category || ctx.category || 'other',
    categoryLabel: categoryLabel(template.category || ctx.category || 'other'),
    total,
    unit,
    mode: template.mode || (questions.length ? 'paper' : 'standard'),
    levels: template.levels || (template.mode === 'paper' ? [] : getScoreScheme(total, unit, false).levels),
    summary: template.description || '按评分点逐项给分，具体档位见下表。',
    criteria,
    partialRules: template.partialRules || [],
    triviality: categoryTriviality(template.category || ctx.category || 'other'),
    source: template.source || '内置评分标准模板',
    questions,
  };
}

export function fallbackRubric(ctx, template = null) {
  if (template && (template.official || template.id?.startsWith('first-2026') || template.id?.startsWith('extra-2026'))) {
    return templateToRubric(template, ctx);
  }
  const total = ctx.total;
  const unit = ctx.unit;
  const mode = ctx.mode;
  let criteria = [];
  if (mode === 'paper' && ctx.questions?.length) {
    criteria = ctx.questions.map((question) => ({
      name: `第${question.no}题（${question.type}）`,
      max: question.max,
      description: question.mode === 'all-or-nothing' ? '填空题：0 分或满分。' : `${question.unit} 分一个得分点。`,
      anchors: [],
    }));
  } else if (total === 50) {
    criteria = [
      { name: '关键方向与构造', max: 10, description: '找到正确的转化、构造或不变量。', anchors: [] },
      { name: '核心引理/主估计', max: 20, description: '证明真正推进结论的关键步骤。', anchors: [] },
      { name: '完成主要论证', max: 10, description: '把关键步骤推进到接近结论。', anchors: [] },
      { name: '收尾与严谨性', max: 10, description: '边界、等号、退化情形与最终结论。', anchors: [] },
    ];
  } else if (total === 40) {
    criteria = [
      { name: '关键方向与构造', max: 10, description: '找到正确的转化、构造或不变量。', anchors: [] },
      { name: '核心论证', max: 20, description: '证明真正推进结论的关键步骤。', anchors: [] },
      { name: '完成结论', max: 10, description: '收尾、边界与最终结论。', anchors: [] },
    ];
  } else if (total === 21) {
    criteria = Array.from({ length: 7 }, (_, i) => ({
      name: `得分点 ${i + 1}`,
      max: 3,
      description: i === 0 ? '方向或关键观察。' : i === 6 ? '完成结论与严谨性。' : '实质性中间进展。',
      anchors: [],
    }));
  } else if (total === 7) {
    criteria = Array.from({ length: 7 }, (_, i) => ({
      name: `得分点 ${i + 1}`,
      max: 1,
      description: i === 0 ? '方向或关键观察。' : i === 6 ? '完成结论与严谨性。' : '实质性中间进展。',
      anchors: [],
    }));
  } else if (total === 16) {
    criteria = [
      { name: '完整证明', max: 12, description: '完成主要下界/结论。', anchors: [{ points: 4, condition: '关键中间步骤' }, { points: 12, condition: '完整证明' }] },
      { name: '取等/验证', max: 4, description: '说明等号可取或验证构造。', anchors: [] },
    ];
  } else if (total === 20) {
    criteria = [
      { name: 'A 部分', max: 10, description: '完成题目的第一个主要结论。', anchors: [{ points: 5, condition: 'A 的中间步骤' }, { points: 10, condition: '完成 A' }] },
      { name: 'B 部分', max: 10, description: '完成题目的第二个主要结论。', anchors: [{ points: 5, condition: 'B 的中间步骤' }, { points: 10, condition: '完成 B' }] },
    ];
  } else if (total === 8) {
    criteria = [{ name: '最终答案', max: 8, description: '只有答案正确才得 8 分。', anchors: [] }];
  } else if (total === 12) {
    criteria = [
      { name: '代数变形与化简', max: 4, description: '展开、通分、消元等关键变形是否正确。', anchors: [] },
      { name: '变量代换与范围', max: 3, description: '变量范围、依据与边界是否交代。', anchors: [] },
      { name: '最值论证', max: 4, description: '单调性、不等式或分类讨论是否完成。', anchors: [] },
      { name: '等号条件与书写', max: 1, description: '取等条件、结论完整性与书写。', anchors: [] },
    ];
  } else {
    const step = unit > 0 ? unit : 1;
    const count = Math.max(1, Math.floor(total / step));
    criteria = Array.from({ length: count }, (_, index) => ({
      name: `得分点 ${index + 1}`,
      max: index === count - 1 ? Math.round((total - step * (count - 1)) * 10) / 10 : step,
      description: '按题目实际结构拆分；具体条件见题面。',
      anchors: [],
    }));
  }
  return {
    title: `${categoryLabel(ctx.category)} · ${total} 分题`,
    category: ctx.category || 'other',
    categoryLabel: categoryLabel(ctx.category),
    total,
    unit,
    mode,
    levels: mode === 'paper' ? [] : getScoreScheme(total, unit, false).levels,
    summary: `${CATEGORY_HINTS[ctx.category] || CATEGORY_HINTS.other} ${schemePromptText({ total, unit, mode, levels: getScoreScheme(total, unit, false).levels })}`,
    criteria,
    partialRules: mode === 'paper' || mode === 'all-or-nothing' ? [] : [
      { label: '部分方向', points: Math.max(unit, Math.round((total * 0.3) / unit) * unit), note: '只完成一个较简单的方向（如构造）时，按实际贡献给一个较低档；不自动给一半或满分。', exclusive: false },
    ],
    triviality: categoryTriviality(ctx.category),
    zeroConditions: [
      '只写最终答案，没有任何可核验推导（填空除外）',
      '只有正确思路、方法名、开头或框架，但没有得到任何正确结论',
      '结论错误且没有独立成立的实质中间结论',
    ],
    source: 'AI 依据题面制定（未提供官方评分标准）',
  };
}




function normalizeCitedResults(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === 'object')
    .slice(0, 12)
    .map((item) => ({
      name: clean(item.name, '').slice(0, 160),
      statement: clean(item.statement, '').slice(0, 1200),
      known: item.known === true,
      searchQuery: clean(item.searchQuery, '').slice(0, 240),
      whyNeeded: clean(item.whyNeeded, '').slice(0, 500),
    }))
    .filter((item) => item.name || item.statement);
}

function normalizeStudentRoute(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const status = ['valid', 'partial', 'invalid'].includes(raw.status)
    ? raw.status
    : raw.alignment === 'invalid'
      ? 'invalid'
      : ['same', 'equivalent-valid', 'different-valid'].includes(raw.alignment)
        ? 'valid'
        : 'partial';
  const summary = clean(raw.summary, '').slice(0, 2000);
  const scoringNote = clean(raw.scoringNote, '').slice(0, 2000);
  const acceptedSteps = Array.isArray(raw.acceptedSteps)
    ? raw.acceptedSteps.map((item) => clean(item, '')).filter(Boolean).slice(0, 10)
    : [];
  const routeSolution = clean(raw.routeSolution || raw.alternativeSolution, '').slice(0, 12000);
  const criterionMap = Array.isArray(raw.criterionMap)
    ? raw.criterionMap
        .filter((item) => item && typeof item === 'object')
        .slice(0, 12)
        .map((item) => ({
          criterion: clean(item.criterion, '').slice(0, 120),
          studentEvidence: clean(item.studentEvidence, '').slice(0, 1000),
          credit: ['full', 'partial', 'none'].includes(item.credit) ? item.credit : 'none',
          note: clean(item.note, '').slice(0, 800),
        }))
    : [];
  const maxScoreViaRoute = Number(raw.maxScoreViaRoute);
  if (!summary && !scoringNote && !acceptedSteps.length && !routeSolution) return null;
  return {
    status,
    summary,
    routeSolution,
    acceptedSteps,
    criterionMap,
    maxScoreViaRoute: Number.isFinite(maxScoreViaRoute) ? Math.max(0, maxScoreViaRoute) : undefined,
    scoringNote,
  };
}


export function normalizeGeneratedRubric(raw, ctx) {
  const total = ctx.total;
  const unit = ctx.unit;
  let criteria = Array.isArray(raw?.criteria)
    ? raw.criteria
        .map((item, index) => {
          if (!item || typeof item !== 'object') return null;
          const max = clamp(asNumber(item.max, 0), 0, total);
          const anchors = Array.isArray(item.anchors)
            ? item.anchors.slice(0, 8).map((anchor) => ({ points: clamp(asNumber(anchor?.points, 0), 0, max), condition: clean(anchor?.condition, '') }))
            : [];
          return {
            name: studentFacing(item.name, `得分点 ${index + 1}`).slice(0, 100),
            max: roundHalf(max),
            description: studentFacing(item.description, '').slice(0, 1200),
            anchors,
          };
        })
        .filter(Boolean)
    : [];
  if (!criteria.length) return fallbackRubric(ctx, ctx.template);
  let sum = criteria.reduce((value, item) => value + item.max, 0);
  if (sum <= 0) return fallbackRubric(ctx, ctx.template);
  if (Math.abs(sum - total) > 0.01) {
    const factor = total / sum;
    criteria = criteria.map((item) => ({ ...item, max: roundHalf(item.max * factor) }));
    sum = criteria.reduce((value, item) => value + item.max, 0);
    const diff = roundHalf(total - sum);
    if (diff !== 0 && criteria.length) {
      criteria[criteria.length - 1].max = Math.max(0, roundHalf(criteria[criteria.length - 1].max + diff));
    }
  }
  if (unit > 1) {
    // CMO 21→3, CMO 40/50→10, 一试 16→4 / 20→5: every criterion
    // maximum and anchor must be a whole scoring unit.
    const snapUnit = (value) => Math.max(0, Math.round(value / unit) * unit);
    criteria = criteria.map((item) => {
      const max = Math.max(unit, Math.min(total, snapUnit(item.max)));
      return {
        ...item,
        max,
        anchors: item.anchors.map((anchor) => ({ ...anchor, points: anchor.points > 0 ? Math.max(unit, Math.min(max, snapUnit(anchor.points))) : 0 })),
      };
    });
    let unitSum = criteria.reduce((value, item) => value + item.max, 0);
    let diff = total - unitSum;
    if (diff !== 0) {
      // Adjust from the last criterion backwards, in whole units.
      for (let index = criteria.length - 1; index >= 0 && diff !== 0; index -= 1) {
        const step = diff > 0 ? unit : -unit;
        const current = criteria[index].max;
        const next = Math.max(unit, Math.min(total, current + step));
        if (next !== current) {
          criteria[index] = { ...criteria[index], max: next };
          diff += current - next;
        }
      }
    }
  }
  const partialRules = Array.isArray(raw?.partialRules)
    ? raw.partialRules.slice(0, 30).map((rule) => ({
        label: studentFacing(rule?.label, '部分分').slice(0, 40),
        points: asNumber(rule?.points, 0),
        note: studentFacing(rule?.note, '').slice(0, 800),
        exclusive: Boolean(rule?.exclusive),
      }))
    : [];
  return {
    title: studentFacing(raw?.title, `${categoryLabel(ctx.category)} · ${total} 分题`).replace(/\s*[·\-]?\s*评分标准\s*$/g, '').slice(0, 140),
    category: CATEGORY_LABELS[raw?.category] ? raw.category : ctx.category,
    categoryLabel: categoryLabel(CATEGORY_LABELS[raw?.category] ? raw.category : ctx.category),
    total,
    unit,
    mode: ctx.mode,
    levels: ctx.mode === 'paper' ? [] : getScoreScheme(total, unit, false).levels,
    summary: studentFacing(raw?.summary, '按评分点逐项给分。').slice(0, 2000),
    criteria,
    partialRules,
    triviality: studentFacing(raw?.triviality, categoryTriviality(ctx.category)).slice(0, 2000),
    source: studentFacing(raw?.source, 'AI 依据题面制定（未提供官方评分标准）').slice(0, 300),
    studentRoute: normalizeStudentRoute(raw?.studentRoute),
    citedResults: normalizeCitedResults(raw?.citedResults),
    zeroConditions: Array.isArray(raw?.zeroConditions) && raw.zeroConditions.length
      ? raw.zeroConditions.map((item) => clean(item, '')).filter(Boolean).slice(0, 8)
      : [
          '只写最终答案，没有任何可核验推导（填空除外）',
          '只有正确思路、方法名、开头或框架，但没有得到任何正确结论',
          '结论错误且没有独立成立的实质中间结论',
        ],
    questions: ctx.questions || [],
  };
}

export function buildRubricMessages({ problemText, category, total, unit, mode, questions, template, solutionCount = 0 }) {
  const categoryName = categoryLabel(category);
  const scheme = getScoreScheme(total, unit, mode === 'paper');
  const questionText = questions?.length
    ? questions.map((q) => `第${q.no}题（${q.type}，${q.max}分，${q.mode === 'all-or-nothing' ? '0/' + q.max : q.unit + '分/点'}）`).join('\n')
    : '单题';
  const templateHint = template?.official
    ? `已有官方模板「${template.name}」，请以此模板的评分点和档位为准，不另立评分点。`
    : `当前选择的模板是「${template?.name || '自动研判'}」；如模板只给出框架，请结合题目补全可核查的评分点。`;
  return `请为下面的题目制定正式评分标准。

【题目】
${problemText || '（见题目图片）'}

【题型】${categoryName}
【总分】${total} 分
【评分单位】${unit} 分/点
【模式】${mode === 'paper' ? '整卷（按题给分）' : mode === 'all-or-nothing' ? '全对全错' : '单题'}
【允许档位】${mode === 'paper' ? '按题结构' : scheme.levels.join(' / ')}
【评分结构】
${questionText}

【模板提示】
${templateHint}

【学生解答】${solutionCount ? `共 ${solutionCount} 页，随后按页给出。不要独立解题；按页读取学生思路，重建其路线。` : '未提供。'}

【学生路线】
不要写 referenceSolution，也不要另起正确解法。必须按学生实际路线填写 studentRoute：status、routeSolution、acceptedSteps、criterionMap、scoringNote。

【硬约束】
- 每个评分点的满分与锚点分都必须是 ${mode === 'paper' ? '对应题目的评分单位' : `${unit} 分`}的整数倍。
- 必须覆盖整题的关键得分结构，不能只写一句“完成证明给满分”。
- 对组合题等有“构造/证明”两个方向的题，必须分别设置评分点，并说明较简单方向的部分分。
- 只输出 JSON，不要输出 Markdown；学生路线只写入 studentRoute。`;
}

export async function generateRubricWithModel({ callModel, args, images }) {
  const text = buildRubricMessages(args);
  const content = [{ type: 'text', text }];
  for (const image of images || []) {
    content.push({ type: 'text', text: `【${image.label}】` });
    content.push({ type: 'image_url', image_url: { url: image.dataUrl } });
  }
  const response = await callModel({
    systemPrompt: RUBRIC_SYSTEM_PROMPT,
    userContent: content,
    jsonMode: true,
    maxTokens: 18000,
  });
  return parseJsonPayload(response.content);
}
