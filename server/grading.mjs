import crypto from 'node:crypto';
import { jsonrepair } from 'jsonrepair';
import { buildLevels, categoryLabel, getScoreScheme, snapScore } from './scoring.mjs';
import { citedResultsPromptBlock, studentRoutePromptBlock } from './skill-policy.mjs';

const SEVERITIES = new Set(['correct', 'error', 'warning', 'info']);

export const SYSTEM_PROMPT = `你是一位资深数学竞赛阅卷人，长期参与高中数学联赛、CMO / IMO 级别命题与阅卷。你的任务不是“夸赞解答”，而是像真实阅卷一样：先独立判断题目与正确解法，再逐行审读学生手写稿，按评分标准给出可复核的分数，并把问题定位到具体位置。

【工作原则】
1. 不要另做参考解；先按学生实际路线核验结论，再开始评分。不要因为学生写得长或字迹工整就给分，也不要因为字迹潦草而扣分；只有当书写影响数学可读性时才提示。
2. 只评价稿纸上真实出现的内容，不替学生补全未写出的步骤。若某一步可能有多种理解，明确指出歧义，并按较合理的一种暂评。
3. 对每一个扣分点必须说明：这一步哪里不成立、为什么、应如何补正。禁止使用“过程不够严谨”“再完善一下”这类空泛评语。
4. 分数必须有据可查：criteria 中各项 awarded 之和应等于总分 score。若使用给定评分模板，必须沿用模板的评分项与满分，不得另立项目。
5. 若学生得到正确答案但论证有缺口，给思路分与部分分；若结论错误但关键步骤有价值，也给相应过程分。
6. 分数必须落在给定的【允许档位】上：50/40 分题通常 10 分一个得分点，21 分题 3 分一个得分点，7 分题 1 分一个得分点；一试填空只有 0/8，一试解答分别按 4 分或 5 分一个得分点。不得出现 7 分、13 分这类不在档位上的分数。
7. 先判断结论是否平凡：直接套定义、例行变形、重复题设属于平凡步骤；真正推进结论的关键构造、引理、估计与分类讨论才给主要分。组合题分“构造/证明”两个方向时，较简单的方向只按实际贡献给部分分（例如 20/50、10/40、6/21、2/7 这一量级），不要自动给一半或满分。
8. **长解答必须逐步核验**：解答达到 4 页或整卷模式时，必须逐页、逐个实质步骤核验“这一步是否数学成立、依据是什么、是否偷用未证结论”。不得只写总评或只看首尾；每个评分点 awarded>0 必须能追溯到 stepAudit 中状态为 correct 的步骤。核验覆盖不足时系统会要求重做；仍不足则不计分。
9. 只输出一个合法 JSON 对象。不要输出 Markdown 代码围栏、前言、结语或注释。

【批注坐标】
annotations 用于在原始手写页面上画框。坐标以对应解答页图片左上角为原点，x、y、w、h 均为 0–1 的归一化值：
- x, y 是框的左上角；w, h 是宽高。
- 框要尽量紧贴相关的一行/一段手写内容，不要框住整页。若批注针对整页或无法定位，w 和 h 设为 0。
- page 是解答页序号，从 1 开始。每页最多 12 条批注，总条数不超过 30 条。
- severity 只能是 "correct"（正确/亮点）、"error"（数学错误）、"warning"（跳步/待补/表述问题）、"info"（方法提示）。
- delta 是该批注对应的分数影响（扣分为负数，加分为正数；没有明确分值影响可省略）。

【输出 JSON 结构】
{
  "score": 数字,
  "maxScore": 数字,
  "gradeLabel": "简短档次，如：优秀 / 良好 / 部分完成 / 需要加强",
  "confidence": 0 到 1 的数字,
  "summary": "两三句话的总评，说明完成度与主要得失分",
  "overallComment": "更完整的总评，包含对解题路线的判断与改进方向，可含换行",
  "criteria": [
    { "name": "评分项", "max": 数字, "awarded": 数字, "reason": "得分/扣分依据，具体到步骤", "status": "full | partial | miss" }
  ],
  "questions": [
    { "no": "9", "type": "解答", "score": 数字, "topic": "代数", "comment": "该题得分/失分一句说明" }
  ],
  "annotations": [
    {
      "page": 1,
      "x": 0.12, "y": 0.20, "w": 0.45, "h": 0.06,
      "severity": "warning",
      "title": "短标题，如：变量范围未说明",
      "comment": "详细说明：这一步做了什么、问题在哪里、为什么",
      "suggestion": "可直接写进订正的修改建议或补写内容",
      "rubric": "关联的评分项名称",
      "question": "题号（整卷模式填写，如 9）",
      "delta": -1
    }
  ],
  "citedResults": [
    {
      "name": "引用定理/引理名称",
      "status": "known | verified | derived | unverified",
      "evidence": "核验依据或你自己补出的推导；unverified 时说明缺什么",
      "criteria": ["受影响的评分项名称"],
      "blocksConclusion": false,
      "note": "是否导致证明不完整，以及后续引用如何处理"
    }
  ],
  "stepAudit": [
    {
      "page": 1,
      "step": 1,
      "claim": "这一步实际写了什么（公式/断言/分类/构造）",
      "status": "correct | gap | wrong | unverified",
      "check": "逐步核验：依据、条件、边界、是否偷用未证结论",
      "criteria": ["对应评分点"],
      "note": "是否需要补证，以及影响"
    }
  ],
  "verificationComplete": true,
  "strengths": ["具体优点，避免空话"],
  "improvements": ["最值得优先改进的问题"],
  "nextSteps": ["可执行的练习或订正建议"]
}`;

function cleanText(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.trim();
}

function asNumber(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundHalf(value) {
  return Math.round(value * 2) / 2;
}

export function parseJsonPayload(content) {
  let text = String(content || '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) text = text.slice(first, last + 1);
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(jsonrepair(text));
  }
}

function fallbackCriteria(rubricItems, maxScore, score) {
  if (!rubricItems.length) {
    return [
      {
        name: '过程与结论',
        max: maxScore,
        awarded: score,
        reason: '模型未返回分项评分，按总分记录。',
        status: score >= maxScore ? 'full' : score > 0 ? 'partial' : 'miss',
      },
    ];
  }
  const total = rubricItems.reduce((sum, item) => sum + asNumber(item.max, 0), 0) || maxScore;
  const ratio = maxScore > 0 ? score / maxScore : 0;
  return rubricItems.map((item) => {
    const max = asNumber(item.max, 0) * (maxScore / total);
    const awarded = Math.min(max, max * ratio);
    return {
      name: cleanText(item.name, '评分项'),
      max: roundHalf(max),
      awarded: roundHalf(awarded),
      reason: '模型未逐项说明，依据总分按比例折算。',
      status: ratio >= 0.999 ? 'full' : awarded > 0 ? 'partial' : 'miss',
    };
  });
}



function normalizeStepAudit(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === 'object')
    .slice(0, 300)
    .map((item) => ({
      page: Math.max(1, Math.round(asNumber(item.page, 1))),
      step: Math.max(1, Math.round(asNumber(item.step, 1))),
      claim: cleanText(item.claim, '').slice(0, 1200),
      status: ['correct', 'gap', 'wrong', 'unverified'].includes(item.status) ? item.status : 'unverified',
      check: cleanText(item.check, '').slice(0, 1600),
      criteria: Array.isArray(item.criteria) ? item.criteria.map((name) => cleanText(name, '')).filter(Boolean).slice(0, 6) : [],
      note: cleanText(item.note, '').slice(0, 800),
    }))
    .filter((item) => item.claim || item.check);
}

function normalizeCitationResults(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === 'object')
    .slice(0, 16)
    .map((item) => ({
      name: cleanText(item.name, '').slice(0, 160),
      status: ['known', 'verified', 'derived', 'unverified'].includes(item.status) ? item.status : 'unverified',
      evidence: cleanText(item.evidence, '').slice(0, 1200),
      criteria: Array.isArray(item.criteria)
        ? item.criteria.map((name) => cleanText(name, '')).filter(Boolean).slice(0, 8)
        : [],
      blocksConclusion: item.blocksConclusion === true,
      note: cleanText(item.note, '').slice(0, 800),
    }))
    .filter((item) => item.name);
}

function normalizeCriteria(rawCriteria, rubricItems, maxScore, score, scheme) {
  const criteria = Array.isArray(rawCriteria)
    ? rawCriteria
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const max = clamp(asNumber(item.max, 0), 0, maxScore);
          let awarded = clamp(asNumber(item.awarded, item.score ?? 0), 0, max);
          if (scheme && scheme.mode === 'all-or-nothing') awarded = awarded >= max / 2 ? max : 0;
          else if (scheme) awarded = snapScore(awarded, max, scheme.unit, scheme.mode);
          return {
            name: cleanText(item.name, '评分项').slice(0, 80),
            max: roundHalf(max),
            awarded: roundHalf(awarded),
            reason: cleanText(item.reason, ''),
            evidence: cleanText(item.evidence, ''),
            status: ['full', 'partial', 'miss'].includes(item.status)
              ? item.status
              : awarded >= max
                ? 'full'
                : awarded > 0
                  ? 'partial'
                  : 'miss',
          };
        })
        .filter(Boolean)
    : [];
  if (!criteria.length) return fallbackCriteria(rubricItems, maxScore, score);
  return criteria;
}

function normalizeDimensions(rawDimensions, score, maxScore) {
  const dims = Array.isArray(rawDimensions)
    ? rawDimensions
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const max = clamp(asNumber(item.max, 0), 0, maxScore);
          return {
            name: cleanText(item.name, '能力维度').slice(0, 40),
            score: roundHalf(clamp(asNumber(item.score, item.awarded ?? 0), 0, max)),
            max: roundHalf(max),
            comment: cleanText(item.comment, ''),
          };
        })
        .filter(Boolean)
    : [];
  if (dims.length) return dims;
  return [{ name: '本题表现', score, max: maxScore, comment: '总评折算' }];
}

function normalizeAnnotations(rawAnnotations, pageCount) {
  if (!Array.isArray(rawAnnotations)) return [];
  return rawAnnotations
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const bbox = Array.isArray(item.bbox) ? item.bbox : null;
      const box = item.box && typeof item.box === 'object' ? item.box : null;
      let x = asNumber(bbox ? bbox[0] : box ? box.x : item.x, 0);
      let y = asNumber(bbox ? bbox[1] : box ? box.y : item.y, 0);
      let w = asNumber(bbox ? Number(bbox[2]) - Number(bbox[0]) : box ? box.w : item.w, 0);
      let h = asNumber(bbox ? Number(bbox[3]) - Number(bbox[1]) : box ? box.h : item.h, 0);
      const located = w > 0.002 && h > 0.002;
      if (located) {
        // Handwriting strokes usually sit slightly outside the model's
        // normalized rectangle. A small, proportional padding keeps
        // ascenders/descenders and the ruled line inside the box.
        const padX = 0.006;
        const padY = 0.006;
        x = clamp(x - padX, 0, 1);
        y = clamp(y - padY, 0, 1);
        w = clamp(w + padX * 2, 0, 1 - x);
        h = clamp(h + padY * 2, 0, 1 - y);
      } else {
        x = 0; y = 0; w = 0; h = 0;
      }
      return {
        id: `a${index + 1}`,
        page: clamp(Math.round(asNumber(item.page, 1)), 1, Math.max(1, pageCount)),
        x: Number(x.toFixed(4)),
        y: Number(y.toFixed(4)),
        w: Number(w.toFixed(4)),
        h: Number(h.toFixed(4)),
        severity: SEVERITIES.has(item.severity)
          ? item.severity
          : ({ 正确: 'correct', 亮点: 'correct', 错误: 'error', 待补: 'warning', 警告: 'warning', 提示: 'info' }[item.severity] || 'info'),
        title: cleanText(item.title, '批注').slice(0, 60),
        comment: cleanText(item.comment, ''),
        suggestion: cleanText(item.suggestion, ''),
        rubric: cleanText(item.rubric, ''),
        question: cleanText(item.question, ''),
        delta: Number.isFinite(Number(item.delta)) ? Number(item.delta) : undefined,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      const aUnlocated = a.w <= 0.002 || a.h <= 0.002;
      const bUnlocated = b.w <= 0.002 || b.h <= 0.002;
      if (aUnlocated !== bUnlocated) return aUnlocated ? 1 : -1;
      if (Math.abs(a.y - b.y) > 0.001) return a.y - b.y;
      return a.x - b.x;
    })
    .slice(0, 30)
    .map((item, index) => ({ ...item, id: `a${index + 1}` }));
}


function normalizeQuestions(rawQuestions, defs) {
  if (!Array.isArray(defs) || !defs.length) return null;
  if (!Array.isArray(rawQuestions) || !rawQuestions.length) return null;
  const byNo = new Map();
  for (const item of rawQuestions) {
    if (!item || typeof item !== 'object') continue;
    byNo.set(String(item.no ?? '').trim(), item);
  }
  const questions = defs.map((def, index) => {
    const item = byNo.get(String(def.no)) || rawQuestions[index] || {};
    const rawScore = asNumber(item.score ?? item.awarded ?? item.points, 0);
    const substantive = item.substantive !== false && item.gatePassed !== false;
    const score = substantive ? snapScore(rawScore, def.max, def.unit, def.mode) : 0;
    return {
      no: String(def.no),
      type: def.type,
      topic: def.topic || cleanText(item.topic, ''),
      max: def.max,
      unit: def.unit,
      score,
      substantive,
      comment: cleanText(item.comment ?? item.reason, ''),
      status: score >= def.max ? 'full' : score > 0 ? 'partial' : 'miss',
    };
  });
  return questions;
}

export function normalizeResult(raw, ctx) {
  const maxScore = Math.max(0.5, asNumber(ctx.maxScore, 10));
  const rawScore = clamp(asNumber(raw?.score, raw?.totalScore ?? 0), 0, maxScore);
  const scheme = ctx.scoreScheme || getScoreScheme(maxScore, ctx.scoreUnit, false);
  const questions = ctx.paperMode ? normalizeQuestions(raw?.questions, ctx.questionDefs || []) : null;
  let criteria = questions
    ? questions.map((question) => ({
        name: `第${question.no}题（${question.type}${question.topic && !question.topic.includes(question.type) ? ` · ${question.topic}` : ''}）`,
        max: question.max,
        awarded: question.score,
        reason: question.comment || '按题给分。',
        status: question.status,
      }))
    : normalizeCriteria(raw?.criteria, ctx.rubricItems || [], maxScore, rawScore, scheme);
  let score = questions
    ? questions.reduce((sum, item) => sum + item.score, 0)
    : criteria.length
      ? criteria.reduce((sum, item) => sum + item.awarded, 0)
      : rawScore;
  const criteriaTotal = criteria.reduce((sum, item) => sum + item.awarded, 0);
  if (!questions && criteriaTotal > maxScore + 0.01) {
    const factor = maxScore / criteriaTotal;
    criteria = criteria.map((item) => ({
      ...item,
      awarded: roundHalf(item.awarded * factor),
      status: item.awarded * factor >= item.max ? 'full' : item.awarded * factor > 0 ? 'partial' : 'miss',
    }));
    score = roundHalf(criteria.reduce((sum, item) => sum + item.awarded, 0));
  }
  score = roundHalf(clamp(score, 0, maxScore));
  if (!criteria.length) criteria = fallbackCriteria(ctx.rubricItems || [], maxScore, score);

  const stepAudit = normalizeStepAudit(raw?.stepAudit);
  const verificationIncomplete = raw?.verificationIncomplete === true;
  if (verificationIncomplete) {
    criteria = criteria.map((item) => ({ ...item, awarded: 0, status: 'miss', reason: '长解答逐步核验未完成，暂不计分。' }));
    score = 0;
  }
  const citedResults = normalizeCitationResults(raw?.citedResults);
  const blockedCriteria = new Set(
    citedResults
      .filter((item) => item.status === 'unverified')
      .flatMap((item) => item.criteria),
  );
  const blockedAll = citedResults.some((item) => item.status === 'unverified' && (!item.criteria.length || item.blocksConclusion));
  if (blockedCriteria.size || blockedAll) {
    criteria = criteria.map((item) => {
      const blocked = blockedAll || blockedCriteria.has(item.name);
      return blocked ? { ...item, awarded: 0, status: 'miss', reason: `${item.reason ? `${item.reason}；` : ''}引用定理未核验，按证明不完整处理` } : item;
    });
    score = questions ? score : roundHalf(criteria.reduce((sum, item) => sum + item.awarded, 0));
  }

  let substantiveGate = null;
  if (!questions && raw?.substantiveGate && typeof raw.substantiveGate === 'object') {
    const passed = raw.substantiveGate.passed !== false && raw.substantiveGate.scoreAllowed !== false;
    substantiveGate = {
      passed,
      reason: cleanText(raw.substantiveGate.reason, passed ? '' : '未形成可核验的正确子结论。'),
    };
    if (!passed) {
      score = 0;
      criteria = criteria.map((item) => ({ ...item, awarded: 0, status: 'miss' }));
    }
  }

  const ratio = maxScore > 0 ? score / maxScore : 0;
  const defaultGrade = substantiveGate && !substantiveGate.passed
    ? '未达实质门槛'
    : ratio >= 0.85 ? '优秀' : ratio >= 0.7 ? '良好' : ratio >= 0.5 ? '部分完成' : '需要加强';
  const strengths = Array.isArray(raw?.strengths)
    ? raw.strengths.map((item) => cleanText(item, '')).filter(Boolean).slice(0, 8)
    : [];
  const improvements = Array.isArray(raw?.improvements)
    ? raw.improvements.map((item) => cleanText(item, '')).filter(Boolean).slice(0, 8)
    : [];
  const nextSteps = Array.isArray(raw?.nextSteps)
    ? raw.nextSteps.map((item) => cleanText(item, '')).filter(Boolean).slice(0, 8)
    : [];
  let dimensions = normalizeDimensions(raw?.dimensions, score, maxScore);
  if (substantiveGate && !substantiveGate.passed) {
    dimensions = dimensions.map((item) => ({ ...item, score: 0, comment: '未通过实质给分门禁' }));
  }

  return {
    score,
    maxScore,
    category: ctx.category || 'other',
    categoryLabel: categoryLabel(ctx.category || 'other'),
    scoreUnit: ctx.paperMode ? 1 : scheme.unit,
    paperMode: Boolean(ctx.paperMode),
    questions: questions || undefined,
    gradeLabel: substantiveGate && !substantiveGate.passed
      ? '未达实质门槛'
      : cleanText(raw?.gradeLabel, defaultGrade).slice(0, 20),
    confidence: Number(clamp(asNumber(raw?.confidence, 0.8), 0, 1).toFixed(2)),
    summary: substantiveGate && !substantiveGate.passed
      ? `本题记 0 分：${substantiveGate.reason}`
      : cleanText(raw?.summary, '已完成批改。'),
    overallComment: substantiveGate && !substantiveGate.passed
      ? `未通过实质给分门禁：${substantiveGate.reason}`
      : cleanText(raw?.overallComment, cleanText(raw?.summary, '已完成批改。')),
    dimensions,
    criteria,
    stepAudit,
    verificationIncomplete,
    verificationComplete: verificationIncomplete ? false : raw?.verificationComplete !== false,
    citedResults,
    substantiveGate: substantiveGate || undefined,
    annotations: normalizeAnnotations(raw?.annotations, ctx.solutionCount || 1),
    strengths,
    improvements,
    nextSteps,
  };
}

export function buildRequestMessages({ problemText, solutionCount, problemCount, rubricText, rubricName, rubricItems, maxScore, strictness, studentName, sourceLabel, images, category = 'other', paperMode = false, questionDefs = [], scoreScheme = null, studentRoute = null, citedResults = [] }) {
  const strictMap = {
    standard: '按常规竞赛阅卷尺度赋分，既看结论也看论证完整性。',
    strict: '采用从严尺度：任何实质性跳步、未说明的范围或未验证的边界都要扣分。',
    encouraging: '采用鼓励尺度：优先认可正确的思路与有效进展，但数学错误仍须明确指出，不得虚高。',
  };
  const templateText = rubricItems.length
    ? rubricItems
        .map((item, i) => `${i + 1}. ${item.name}（满分 ${item.max} 分）${item.description ? `：${item.description}` : ''}`)
        .join('\n')
    : '未预设固定评分项。请根据题目结构与解答实际，拆解 3–5 个可核查的评分项，并确保满分合计为 ' + maxScore + ' 分。';

  const scheme = scoreScheme || getScoreScheme(maxScore, 1, paperMode);
  const levels = scheme.mode === 'paper' ? '按题结构' : (scheme.levels || buildLevels(maxScore, scheme.unit, scheme.mode)).join(' / ');
  const questionText = paperMode && questionDefs.length
    ? questionDefs.map((q) => `第${q.no}题：${q.type}，满分 ${q.max} 分，${q.mode === 'all-or-nothing' ? '只有 0 或满分' : `${q.unit} 分/点`}${q.topic ? `，${q.topic}` : ''}`).join('\n')
    : '单题';
  const header = `请批改以下数学竞赛手写解答。

【题目文字】
${problemText || '（题目未提供文字，请从题目图片中识读）'}

【题目图片】${problemCount ? `共 ${problemCount} 张，随后按顺序给出。` : '无。'}
【学生手写解答】共 ${solutionCount} 页，随后按页码顺序给出。批注中的 page 必须对应这里的页码。
【逐步核验要求】${solutionCount >= 4 || paperMode ? '本解答较长：必须逐页、逐步核验，输出 stepAudit；不能只写总评。' : '建议逐步骤核验；若解答较长，按长解答规则处理。'}
${studentName ? `【学生】${studentName}` : ''}
${sourceLabel ? `【来源/考试】${sourceLabel}` : ''}

【评分标准名称】${rubricName || '自动研判'}
【题型】${categoryLabel(category)}
【模式】${paperMode ? '整卷，按题逐项给分' : '单题'}
【题目/整卷结构】
${questionText}
【总分】${maxScore} 分
【允许档位】${levels}
【尺度】${strictMap[strictness] || strictMap.standard}
【实质给分门禁（最高优先级）】
先做零分检查，再谈部分分：
1. 只写最终答案、猜测或结论，没有可核验推导 → 0 分（填空除外；填空正确即满分）。
2. 只有正确思路、方法名、设元、开头或框架，但没有得到任何正确的中间结论/完成方向 → 0 分。思路正确不等于得分。
3. 结论错误，且没有任何独立成立的实质子结论 → 0 分。
4. 步骤多、篇幅长、书写认真、态度好，都不构成得分理由。
5. 只有把一个正确的数学子结论、完整方向或完整构造真正做出来，才可给对应评分点的分。
6. 例外：正确完成充分性/必要性的一支、组合的完整构造并验证、几何中完整证明的引理，属于实质进展，可按对应档给分。
7. 若使用官方评分标准，官方明确列出的中间结论按其档位给分；但不得额外给“思路分”“方法分”。

【评分标准名称与预设】
${templateText}

${studentRoutePromptBlock(studentRoute)}

${citedResultsPromptBlock(citedResults)}

【用户提供的答案 / 评分标准】
${rubricText || '（未提供；系统已在上一步生成了本题评分标准 PDF，请按下方评分点给分）'}

【输出要求】
${paperMode ? '- 必须逐题输出 questions 数组，包含上述每一题，不得合并或漏题。' : '- 必须逐项输出 criteria，各项 awarded 必须是允许档位中的数。'}
- 所有得分必须落在【允许档位】上；填空只有 0 或满分。
- 必须输出 stepAudit：解答达到 4 页或整卷模式时，逐页、逐个实质步骤核验；每个 awarded>0 的评分点都要能对应到 status=correct 的步骤。
- 必须输出 citedResults：学生在解答中引用的每个命名定理/引理都要列出；不确定或搜不到的标 unverified，并把依赖它的 criteria awarded 置 0。
- 必须输出 substantiveGate：{ passed: 布尔值, reason: 一句话说明是否通过实质给分门禁 }；整卷模式每题的 questions[] 加 substantive 布尔值，未通过则该题 score=0。
- criteria 中每项 awarded>0 时，必须给出 evidence 字段，引用卷面上对应的具体步骤/结论；只有正确子结论才给分。
- 每条 error / warning 必须说明“错在哪、为什么、如何改”。
- annotations 的坐标只覆盖相关手写区域；整卷模式请填写 question 字段。
- 只输出 JSON。

【输出前自检】
- 是否已独立核验最终答案，并按【实质给分门禁】排除了只写答案、只有思路、无正确结论的得分？
- ${paperMode ? 'questions 是否覆盖每一题，且分数之和等于 score？' : 'criteria 的 awarded 之和是否等于 score，且都落在允许档位？'}
- 每条 error / warning 是否说明了“错在哪、为什么、如何改”？
- annotations 的坐标是否只覆盖相关手写区域？
- 是否至少指出 1 个具体优点（若确实存在）？

现在只输出 JSON 对象。`;

  const content = [{ type: 'text', text: header }];
  for (const image of images) {
    content.push({ type: 'text', text: `【${image.label}】` });
    content.push({ type: 'image_url', image_url: { url: image.dataUrl } });
  }
  return content;
}


function hasSufficientStepAudit(raw, args) {
  if (!(Number(args.solutionCount) >= 4 || args.paperMode)) return true;
  if (!raw || raw.verificationComplete === false) return false;
  const steps = Array.isArray(raw.stepAudit) ? raw.stepAudit : [];
  const required = Math.max(1, Number(args.solutionCount) || 1);
  const pages = new Set(steps.map((item) => Number(item?.page)).filter((page) => Number.isFinite(page) && page >= 1));
  return steps.length >= required && pages.size >= Math.ceil(required * 0.75);
}

export async function gradeWithModel({ callModel, args, images, rubricItems }) {
  const longSolution = Number(args.solutionCount) >= 4 || Boolean(args.paperMode);
  const userContent = buildRequestMessages({
    ...args,
    rubricItems,
    images,
  });
  let raw;
  let usage;
  let firstResponse = null;
  try {
    const first = await callModel({ systemPrompt: SYSTEM_PROMPT, userContent, jsonMode: true, maxTokens: longSolution ? 24000 : 16000 });
    firstResponse = first;
    raw = parseJsonPayload(first.content);
    usage = first.usage;
  } catch {
    const repairMessages = [
      ...userContent,
      { type: 'text', text: `你上一条输出无法被解析为 JSON。请严格只输出一个合法 JSON 对象，不要任何解释或代码围栏。上次输出片段：\n${String(firstResponse?.content || '').slice(0, 2500)}` },
    ].filter(Boolean);
    const second = await callModel({
      systemPrompt: SYSTEM_PROMPT + '\n特别注意：只输出 JSON，且不要截断。',
      userContent: repairMessages,
      jsonMode: true,
      maxTokens: 16000,
    });
    try {
      raw = parseJsonPayload(second.content);
      usage = second.usage;
    } catch {
      const error = new Error('模型返回的内容无法解析为评分 JSON，通常是输出过长被截断。请减少批注数量或重试。');
      error.status = 502;
      throw error;
    }
  }

  if (!hasSufficientStepAudit(raw, args)) {
    const auditMessages = [
      ...userContent,
      { type: 'text', text: `上次输出没有达到长解答逐步核验要求：解答共 ${args.solutionCount || 1} 页，必须逐页、逐个实质步骤输出 stepAudit，至少 ${Math.ceil((Number(args.solutionCount) || 1) * 0.75)} 页有核验记录，且每个 awarded>0 的评分项都能追溯到 status=correct 的步骤。请重新输出完整 JSON；不要只写总评。` },
    ];
    const audited = await callModel({
      systemPrompt: SYSTEM_PROMPT + '\n特别注意：长解答必须逐页逐步核验，stepAudit 不能省略。',
      userContent: auditMessages,
      jsonMode: true,
      maxTokens: 24000,
    });
    try {
      raw = parseJsonPayload(audited.content);
      usage = audited.usage;
    } catch {
      raw = { ...(raw || {}), verificationIncomplete: true };
    }
    if (!hasSufficientStepAudit(raw, args)) raw.verificationIncomplete = true;
  }
  if (longSolution) raw.verificationComplete = !raw.verificationIncomplete;
  return { raw, usage };
}

export function demoResult({ maxScore = 12, rubricName = '自动研判', rubricItems = [], problemText, solutionCount = 1, category = 'algebra', scoreUnit = 1, paperMode = false, questions = [], generatedRubric = null }) {
  const ratio = 10 / 12;
  const criteria = rubricItems.length
    ? rubricItems.map((item, index) => {
        const max = Number(item.max) || 0;
        const awarded = index === rubricItems.length - 1 ? 0 : Math.min(max, Math.round(max * ratio * 2) / 2);
        return {
          name: item.name,
          max,
          awarded,
          reason:
            index === rubricItems.length - 1
              ? '最终等号条件与取等情形未在卷面交代，扣去本项全部分数。'
              : '该环节的推导与结论均可复核，按评分项给分。',
          status: awarded >= max ? 'full' : awarded > 0 ? 'partial' : 'miss',
        };
      })
    : [
        { name: '代数变形与化简', max: 4, awarded: 4, reason: '展开、通分与代换均正确，没有出现运算错误。', status: 'full' },
        { name: '变量代换与范围', max: 3, awarded: 2, reason: '令 t=xy 的方向正确，也写出了 0<t≤1/4，但没有说明范围由 x+y=1 与 AM-GM 得到。', status: 'partial' },
        { name: '最值论证', max: 4, awarded: 4, reason: '求导判断单调性，并正确算出 f(1/4)=25/4。', status: 'full' },
        { name: '等号条件与书写', max: 1, awarded: 0, reason: '未写出取等条件 x=y=1/2，结论的完整性不足。', status: 'miss' },
      ];

  if (rubricItems.length) {
    // Keep the template's exact maxima while preserving the 10/12 demonstration ratio.
    const currentMax = criteria.reduce((sum, item) => sum + item.max, 0);
    if (currentMax > 0 && Math.abs(currentMax - maxScore) > 0.001) {
      for (const item of criteria) {
        item.max = Math.round((item.max / currentMax) * maxScore * 2) / 2;
        item.awarded = Math.min(item.max, Math.round((item.awarded / currentMax) * maxScore * 2) / 2);
        item.status = item.awarded >= item.max ? 'full' : item.awarded > 0 ? 'partial' : 'miss';
      }
    }
    if (maxScore === 12 && criteria.length === 4) {
      criteria[0].awarded = criteria[0].max;
      criteria[1].awarded = Math.min(criteria[1].max, 2);
      criteria[2].awarded = criteria[2].max;
      criteria[3].awarded = 0;
      for (const item of criteria) item.status = item.awarded >= item.max ? 'full' : item.awarded > 0 ? 'partial' : 'miss';
    }
  }

  if (!rubricItems.length) {
    const factor = maxScore / 12;
    if (Math.abs(factor - 1) > 0.001) {
      for (const item of criteria) {
        item.max = Math.round(item.max * factor * 2) / 2;
        item.awarded = Math.min(item.max, Math.round(item.awarded * factor * 2) / 2);
        item.status = item.awarded >= item.max ? 'full' : item.awarded > 0 ? 'partial' : 'miss';
      }
    }
  }

  const score = Math.round(criteria.reduce((sum, item) => sum + item.awarded, 0) * 2) / 2;
  const annotations = [
    {
      id: 'a1',
      page: 1,
      x: 0.13,
      y: 0.145,
      w: 0.66,
      h: 0.124,
      severity: 'correct',
      title: '展开与通分正确',
      comment: '先展开两个括号，再把 x/y + y/x 通分为 (x²+y²)/(xy)，并用 x+y=1 将分子整理为 2−2xy。这一串变形是本题最关键的化简，方向和运算都成立。',
      suggestion: '保留这条路径；正式作答时可在旁边标注“利用 x+y=1 消元”，让阅卷人一眼看到代换依据。',
      rubric: '代数变形与化简',
      delta: 4,
    },
    {
      id: 'a2',
      page: 1,
      x: 0.13,
      y: 0.428,
      w: 0.6,
      h: 0.08,
      severity: 'warning',
      title: 't 的范围缺少依据',
      comment: '“0<t≤1/4”本身是对的，但卷面直接从 x+y=1 跳到结论，没有写出 xy≤((x+y)/2)²=1/4。竞赛阅卷中这属于可补的跳步，通常扣 1 分；若在压轴题中，可能影响严谨性评分。',
      suggestion: '补一行：由 AM-GM，xy ≤ ((x+y)/2)² = 1/4；又 x,y>0，故 0<t≤1/4。',
      rubric: '变量代换与范围',
      delta: -1,
    },
    {
      id: 'a3',
      page: 1,
      x: 0.13,
      y: 0.514,
      w: 0.64,
      h: 0.08,
      severity: 'correct',
      title: '单调性判断成立',
      comment: 'f′(t)=1−2/t² 在 0<t≤1/4 上恒小于 0，因此 f 在该区间递减。导数计算与符号判断都正确。',
      suggestion: '可在“故 f(t) 单调递减”后补一句“从而最小值在区间右端点取得”，让最值逻辑更完整。',
      rubric: '最值论证',
      delta: 4,
    },
    {
      id: 'a4',
      page: 1,
      x: 0.13,
      y: 0.643,
      w: 0.64,
      h: 0.08,
      severity: 'warning',
      title: '未交代取等条件',
      comment: '最终答案 25/4 正确，但题目要求“最小值”，必须说明等号可以取到。由 x=y 且 x+y=1 可得 x=y=1/2，此时 xy=1/4，最小值确实可达；卷面缺失这一步。',
      suggestion: '补写：当且仅当 x=y=1/2 时，xy=1/4，f(t) 取得最小值 25/4。',
      rubric: '等号条件与书写',
      delta: -1,
    },
    {
      id: 'a5',
      page: 1,
      x: 0.13,
      y: 0.098,
      w: 0.14,
      h: 0.04,
      severity: 'info',
      title: '开头可先声明定义域',
      comment: '解答从“解”直接开始。若先写“x,y>0，x+y=1”，后面的代换与范围会更自然，也便于检查边界。',
      suggestion: '在首行补：设 x>0，y>0，且 x+y=1。',
      rubric: '书写规范',
      delta: 0,
    },
  ];

  const normalized = normalizeResult(
    {
      score,
      maxScore,
      gradeLabel: score / maxScore >= 0.8 ? '良好' : '部分完成',
      confidence: 0.86,
      summary: '整体路线清楚，代数变形与最值论证都走通了，最终答案正确。主要失分在变量范围的依据与取等条件没有交代，属于“会做但写不满”的典型情况。',
      overallComment:
        '这道题的核心是把目标式化为关于 t=xy 的单变量函数，你的处理非常直接：先展开、再通分、最后用 x+y=1 消元，说明对代数结构有较好的把握。求导判断单调性也没有问题。\n\n需要补强的是证明的闭合性。竞赛解答中，范围 0<t≤1/4 不能只写结果，应当交代它来自均值不等式；同时“最小值”必须验证等号可取。把这两处补上，这份解答就是完整满分。',
      dimensions: [
        { name: '思路与策略', score: 3, max: 3, comment: '单变量化归方向准确。' },
        { name: '运算与变形', score: 4, max: 4, comment: '展开、通分、消元无误。' },
        { name: '严谨性', score: 2, max: 3, comment: '范围依据与取等条件缺失。' },
        { name: '表达与书写', score: 1, max: 2, comment: '步骤清楚，但关键依据未落到纸面。' },
      ],
      criteria,
      annotations,
      strengths: [
        '第一时间想到把双变量式子化为 t=xy 的单变量函数，方向准确。',
        '展开与通分过程干净，x²+y² 用 (x+y)²−2xy 替换的时机恰当。',
        '导数符号判断正确，并完整算出了区间端点处的函数值。',
      ],
      improvements: [
        '使用 AM-GM 得到 t 的范围时，必须把不等式依据写出来。',
        '求最小值后要补验等号条件，否则结论不闭合。',
        '关键代换前先声明变量范围，能减少后续边界讨论的遗漏。',
      ],
      nextSteps: [
        '把本题按“范围依据 + 单调性 + 取等验证”三句话重写一遍。',
        '练习 3 道“双变量化单变量 + 均值不等式”的最值题，重点检查等号条件。',
        '建立自己的收尾清单：范围、单调性、端点、取等，缺一不可。',
      ],
    },
    {
      maxScore,
      rubricItems,
      solutionCount,
      problemText,
      category,
      scoreUnit,
      paperMode,
      questionDefs: questions,
      scoreScheme: getScoreScheme(maxScore, scoreUnit, paperMode),
    },
  );
  // Keep the ability breakdown consistent with the final score, even when a
  // custom rubric awards a different amount than the canned 10/12 example.
  const weights = [3, 4, 3, 2];
  normalized.dimensions = normalized.dimensions.map((dimension, index) => {
    const weight = weights[index] ?? 1;
    return {
      ...dimension,
      score: Math.round((normalized.score * weight) / 12 * 2) / 2,
      max: Math.round((maxScore * weight) / 12 * 2) / 2,
    };
  });
  if (generatedRubric) {
    normalized.generatedRubric = generatedRubric;
    normalized.rubricPdfUrl = generatedRubric.pdfUrl;
  }
  return normalized;
}

export function demoFromRubric({ rubric, maxScore, solutionCount = 1, category = 'other', scoreUnit = 1, paperMode = false, questions = [] }) {
  const unit = paperMode ? 1 : (rubric?.unit || scoreUnit || 1);
  const mode = paperMode ? 'paper' : (rubric?.mode || 'standard');
  const defs = paperMode ? (questions?.length ? questions : rubric?.questions || []) : [];
  const rawQuestions = paperMode
    ? defs.map((question) => ({
        no: question.no,
        type: question.type,
        topic: question.topic,
        score: snapScore(question.max * 0.8, question.max, question.unit, question.mode),
        comment: '演示模式：按评分标准给出的示例分。接入模型后可获得针对卷面的逐题批改。',
      }))
    : undefined;
  const criteria = (rubric?.criteria || []).map((item) => {
    const awarded = snapScore(item.max * 0.8, item.max, unit, mode);
    return {
      name: item.name,
      max: item.max,
      awarded,
      reason: '演示模式：按评分标准给出的示例分。',
      status: awarded >= item.max ? 'full' : awarded > 0 ? 'partial' : 'miss',
    };
  });
  const score = paperMode
    ? rawQuestions.reduce((sum, item) => sum + item.score, 0)
    : criteria.reduce((sum, item) => sum + item.awarded, 0);
  const normalized = normalizeResult(
    {
      score,
      maxScore,
      gradeLabel: score / maxScore >= 0.85 ? '优秀' : score / maxScore >= 0.6 ? '部分完成' : '需要加强',
      confidence: 0.72,
      summary: paperMode ? '演示模式：按整卷评分结构给出示例分数。接入模型后可获得逐题批改与卷面批注。' : '演示模式：按本题评分标准给出示例分数。接入模型后可获得针对卷面的逐点批改。',
      overallComment: '这份示例报告用于展示评分结构、分题得分与 PDF 版式。演示模式不会调用外部模型，也不会根据卷面内容做真实判断。接入 API Key 后，系统会先制定评分标准，再逐页批改。',
      dimensions: [
        { name: '思路与方向', score: Math.round(score * 0.3 * 2) / 2, max: Math.round(maxScore * 0.3 * 2) / 2, comment: '演示数据。' },
        { name: '关键论证', score: Math.round(score * 0.4 * 2) / 2, max: Math.round(maxScore * 0.4 * 2) / 2, comment: '演示数据。' },
        { name: '完成度', score: Math.round(score * 0.2 * 2) / 2, max: Math.round(maxScore * 0.2 * 2) / 2, comment: '演示数据。' },
        { name: '严谨与书写', score: Math.round(score * 0.1 * 2) / 2, max: Math.round(maxScore * 0.1 * 2) / 2, comment: '演示数据。' },
      ],
      criteria,
      questions: rawQuestions,
      annotations: [],
      strengths: ['评分标准已经按题型与总分拆分。', '报告结构、分题得分与 PDF 可以在演示模式下完整体验。'],
      improvements: ['接入真实模型后，才能根据手写解答给出具体批注。'],
      nextSteps: ['在「接入设置」中填入 DeepSeek、智谱或 OpenCode Zen 的 API Key。'],
    },
    {
      maxScore,
      rubricItems: rubric?.criteria || [],
      solutionCount,
      category,
      scoreUnit,
      paperMode,
      questionDefs: defs,
      scoreScheme: getScoreScheme(maxScore, scoreUnit, paperMode),
    },
  );
  return normalized;
}

export function makeJobId() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}
