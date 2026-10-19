/**
 * Distilled from the ~/none mathematical-competition solving skill, with the
 * user's override: the rubric follows the student's route, not an independent
 * reference solution.
 */
export const SOLVING_SKILL_POLICY = `【按学生路线做题规范（用户指定，优先于独立解题）】
1. **不要先独立解题，不要生成参考解**。先逐页阅读学生解答，按学生实际写出的思路重建解题路线；评分标准必须建立在这条路线上。
2. 学生路线正确时，按学生的关键步骤、子结论和构造设评分点，不把“我偏好的解法”强加给学生。
3. 学生路线错误或走偏时，不另起一条正确解法来替换；只核验学生已经写出的步骤，数学上成立的实质子结论可给分，错误步骤本身 0 分。
4. 核验每一步的条件使用、边界/退化/等号；不因书写长、步骤多或“思路看起来对”给分。
5. 几何题若学生使用纯综合法，按其路线核验；若学生使用坐标/向量/复数/解析法，按学生实际方法核验，不强行改成纯几何。
6. 用简体中文和 LaTeX 写数学；不写模型、工具、转录或内部流程旁白。`;

export function studentRoutePromptBlock(route) {
  if (!route) return '（未提供学生路线。不要另做参考解；按卷面实际步骤核验，只给数学上成立的实质子结论分。）';
  return `【学生实际路线（评分标准按此路线制定）】
路线状态：${route.status || 'partial'}
路线概述：${route.summary || '（略）'}
按学生思路重述：
${route.routeSolution || '（未提供）'}
成立的步骤：${(route.acceptedSteps || []).join('；') || '（略）'}
逐评分点映射：
${(route.criterionMap || []).map((item) => `- ${item.criterion || '（未命名）'}：${item.credit}；${item.studentEvidence || '（无）'}${item.note ? `；${item.note}` : ''}`).join('\n') || '（略）'}
该路线可得分：${route.maxScoreViaRoute ?? '（未给出）'}
给分说明：${route.scoringNote || '（略）'}

评分时：不要另做参考解，也不要换成你偏好的解法。只核验学生实际路线；criterionMap 标 full 的评分点不得因步骤“不标准”而扣分。学生路线错误时，只给实际成立的实质子结论分。`;
}

export function citedResultsPromptBlock(results) {
  if (!Array.isArray(results) || !results.length) {
    return '（学生解答未预列出引用定理；评分时若发现命名定理/引理，必须按引用核验规则处理，不确定的标 unverified。）';
  }
  return `【学生引用的定理/引理预检与联网结果】
${results.map((item, index) => `### ${index + 1}. ${item.name || '未命名'}
陈述：${item.statement || '（略）'}
学生为何需要：${item.whyNeeded || '（略）'}
预判：${item.known ? '已知' : '不确定'}
搜索查询：${item.searchQuery || '（未提供）'}
搜索结果：
${(item.searchResults || []).map((r) => `- ${r.title}｜${r.url}\n  ${r.snippet}`).join('\n') || `（无结果${item.searchError ? `：${item.searchError}` : ''}）`}`).join('\n\n')}

核验规则（最高优先级）：
1. 对每条引用给出 status：known（你确定陈述无误）、verified（联网结果足以确认）、derived（你在解答中补出了证明）、unverified（不知道、搜不到或结果不足以确认）。
2. unverified 一律按证明不完整处理。除非你能在 evidence 中写出该引理的可核验推导，否则所有依赖该引理的后续评分点 awarded=0。
3. 不得因为“这是常见定理”就默认成立；不确定必须标 unverified。
4. 在 citedResults 中用 criteria 列出受影响的评分点名称；若整个结论都依赖它，blocksConclusion=true。`;
}
