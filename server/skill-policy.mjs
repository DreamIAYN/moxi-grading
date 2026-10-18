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
