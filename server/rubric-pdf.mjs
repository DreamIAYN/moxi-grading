import fs from 'node:fs/promises';
import path from 'node:path';
import { TMP_DIR, ensureDirs } from './store.mjs';
import { escapeLatex, rich, findTexBinary, runXeLatex } from './pdf.mjs';

function fmt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function modeLabel(rubric) {
  if (rubric.mode === 'paper') return '整卷模式：按题逐项给分';
  if (rubric.mode === 'all-or-nothing') return '全对全错：仅 0 分或满分';
  return `${fmt(rubric.unit)} 分一个得分点`;
}

function criteriaRows(rubric) {
  const rows = [];
  for (const criterion of rubric.criteria || []) {
    const anchors = Array.isArray(criterion.anchors) && criterion.anchors.length
      ? criterion.anchors.map((anchor) => `{\\scriptsize ${fmt(anchor.points)} 分：${rich(anchor.condition)}}`).join('\\par ')
      : '';
    rows.push(
      `\\small ${rich(criterion.name)} & {\\centering\\bfseries ${fmt(criterion.max)}} & {\\scriptsize ${rich(criterion.description || '')}${anchors ? `\\par ${anchors}` : ''}}\\tabularnewline`,
    );
  }
  return rows.join('\n');
}


function zeroRows(rubric) {
  const items = Array.isArray(rubric.zeroConditions) && rubric.zeroConditions.length
    ? rubric.zeroConditions
    : [
        '只写最终答案，没有任何可核验推导（填空除外）',
        '只有正确思路、方法名、开头或框架，但没有得到任何正确结论',
        '结论错误且没有独立成立的实质中间结论',
      ];
  return items.map((item) => `\\item ${rich(item)}`).join('\n');
}



function citationSection(rubric) {
  const items = Array.isArray(rubric.citedResults) ? rubric.citedResults : [];
  if (!items.length) return '';
  const rows = items.map((item, index) => {
    const status = item.known ? '已知' : item.searchResults?.length ? '待评分步核验（有搜索结果）' : '待核验（无搜索结果）';
    const evidence = (item.searchResults || []).slice(0, 2).map((r) => `${r.title}：${r.snippet}`).join('；');
    return `\\item {\\bfseries ${rich(item.name || `引用 ${index + 1}`)}}\\quad {\\scriptsize\\color{muted}${rich(status)}}\\par{\\small ${rich(item.statement || item.whyNeeded || '')}}${evidence ? `\\par{\\scriptsize\\color{muted}${rich(evidence)}}` : ''}`;
  }).join('\n');
  return `\\vspace{3mm}
{\\bfseries\\large 引用定理预检}\\par\\vspace{1mm}
\\begin{tcolorbox}[enhanced,breakable,colback=paper,colframe=accent,arc=1mm,boxrule=0.5pt,left=4mm,right=4mm,top=3mm,bottom=3mm]
{\\small 评分时会逐条核验；未核验且无法补证的引用，其后继评分点按 0 分处理。}\\par\\vspace{1mm}
\\begin{itemize}[leftmargin=5mm,itemsep=1.2mm,topsep=1mm]
${rows}
\\end{itemize}
\\end{tcolorbox}`;
}

function studentRouteSection(rubric) {
  const route = rubric.studentRoute;
  if (!route) return '';
  const status = route.status || (route.alignment === 'invalid' ? 'invalid' : route.alignment === 'partial' ? 'partial' : 'valid');
  const labels = { valid: '路线成立', partial: '部分成立', invalid: '未成立' };
  const routeSolution = route.routeSolution || route.alternativeSolution || '';
  const steps = Array.isArray(route.acceptedSteps) && route.acceptedSteps.length
    ? `\\par\\vspace{1mm}{\\small\\bfseries 可接受步骤：}${rich(route.acceptedSteps.join('；'))}`
    : '';
  return `\\vspace{3mm}
\\begin{tcolorbox}[enhanced,breakable,colback=white,colframe=line,arc=1mm,boxrule=0.5pt,left=4mm,right=4mm,top=3mm,bottom=3mm]
{\\bfseries\\large 学生路线评分依据}\\par\\vspace{1mm}
{\\small\\bfseries ${rich(labels[status] || status || '未判断')}}\\par
{\\small ${rich(route.summary || '')}}\\par\\vspace{1mm}{\\small\\bfseries 按学生思路重述：}${rich(routeSolution || '（略）')}${steps}
${route.scoringNote ? `\\par\\vspace{1mm}{\\small\\bfseries 给分映射：}${rich(route.scoringNote)}` : ''}
\\end{tcolorbox}`;
}

function partialRows(rubric) {
  if (!Array.isArray(rubric.partialRules) || !rubric.partialRules.length) {
    return '\\item {\\color{muted}未设置额外部分分规则；各评分项得分相加即为总分。}';
  }
  return rubric.partialRules.map((rule) => {
    const points = Number(rule.points);
    const label = points > 0 ? `+${fmt(points)} 分` : `${fmt(points)} 分`;
    return `\\item {\\bfseries ${rich(rule.label)}}（${label}${rule.exclusive ? '，不与其他项叠加' : ''}）：${rich(rule.note)}\\par`;
  }).join('\n');
}

export function buildRubricLatex(rubric) {
  const routeSection = studentRouteSection(rubric);
  const citationBlock = citationSection(rubric);
  const levels = Array.isArray(rubric.levels) && rubric.levels.length ? rubric.levels.map(fmt).join(' / ') : '按题给分';
  const rubricCode = String(rubric.id || '').slice(-8).toUpperCase();
  return `\\documentclass[UTF8,fontset=fandol,11pt]{ctexart}
\\usepackage[a4paper,top=22mm,bottom=20mm,left=19mm,right=19mm,headheight=14pt]{geometry}
\\usepackage{amsmath,amssymb}
\\usepackage{booktabs,tabularx,longtable,array}
\\usepackage[most]{tcolorbox}
\\usepackage{xcolor}
\\usepackage{enumitem}
\\usepackage{fancyhdr}
\\usepackage{lastpage}
\\usepackage[hidelinks]{hyperref}
\\usepackage{microtype}
\\definecolor{ink}{HTML}{1D2430}
\\definecolor{muted}{HTML}{6D6A61}
\\definecolor{line}{HTML}{DCD4C4}
\\definecolor{accent}{HTML}{B33A2B}
\\definecolor{paper}{HTML}{F8F5EC}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{4pt}
\\sloppy
\\renewcommand{\\arraystretch}{1.32}
\\providecommand{\\textperiodcentered}{\\ensuremath{\\cdot}}
\\newcommand{\\sechead}[1]{\\vspace{1mm}{\\color{accent}\\rule{9mm}{1.4pt}}\\hspace{2.5mm}{\\LARGE\\bfseries #1}\\par\\vspace{3mm}}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\small\\color{muted}墨析 \\textperiodcentered\\ 评分标准}
\\fancyhead[R]{\\small\\color{muted}RUBRIC${rubricCode ? ` / ${escapeLatex(rubricCode)}` : ''}}
\\fancyfoot[L]{\\scriptsize\\color{muted}评分前生成 \\textperiodcentered\\ 用于统一阅卷尺度}
\\fancyfoot[R]{\\small\\color{muted}\\thepage\\,/\\,\\pageref{LastPage}}
\\renewcommand{\\headrulewidth}{0.3pt}
\\renewcommand{\\headrule}{\\hbox to\\headwidth{\\color{line}\\leaders\\hrule height \\headrulewidth\\hfill}}
\\hypersetup{pdftitle={${escapeLatex(rubric.title || '评分标准')}},pdfauthor={墨析 MOXI},pdfsubject={AI-assisted grading rubric}}
\\begin{document}
\\begin{tcolorbox}[enhanced,colback=paper,colframe=paper,boxrule=0pt,arc=0pt,left=6mm,right=6mm,top=4mm,bottom=4mm]
{\\color{accent}\\small\\bfseries OLYMPIAD GRADING RUBRIC}\\par
\\vspace{2mm}
{\\fontsize{26}{33}\\selectfont\\bfseries ${rich(rubric.title || '本题评分标准')}}\\par
\\vspace{2mm}
{\\small\\color{muted}${rich(rubric.categoryLabel || '')} \\textperiodcentered\\ 满分 ${fmt(rubric.total)} 分 \\textperiodcentered\\ ${rich(modeLabel(rubric))}}\\par
\\end{tcolorbox}
\\vspace{3mm}
\\begin{tcolorbox}[enhanced,colback=white,colframe=line,arc=1mm,boxrule=0.4pt,left=4mm,right=4mm,top=3mm,bottom=3mm]
{\\small
{\\color{muted}题型}\\hspace{4mm}${rich(rubric.categoryLabel || '')}\\par
{\\color{muted}满分}\\hspace{4mm}${fmt(rubric.total)} 分\\par
{\\color{muted}得分点}\\hspace{4mm}${rich(modeLabel(rubric))}\\par
{\\color{muted}允许档位}\\hspace{4mm}${escapeLatex(levels)}\\par
{\\color{muted}来源}\\hspace{4mm}${rich(rubric.source || 'AI 依据题面制定')}\\par
}
\\end{tcolorbox}
\\vspace{4mm}
{\\bfseries\\large 评分总则}\\par\\vspace{1mm}
\\begin{tcolorbox}[enhanced,colback=white,colframe=line,arc=1mm,boxrule=0.5pt,left=4mm,right=4mm,top=3mm,bottom=3mm]
${rich(rubric.summary || '')}
\\end{tcolorbox}
\\vspace{3mm}
${routeSection}
${citationBlock}
{\\bfseries\\large 评分点与分档}\\par\\vspace{1mm}
\\begin{longtable}{@{}>{\\raggedright\\arraybackslash}p{0.27\\textwidth}>{\\centering\\arraybackslash}p{0.09\\textwidth}>{\\raggedright\\arraybackslash}p{0.58\\textwidth}@{}}
\\toprule
\\small\\color{muted}评分点 & \\small\\color{muted}满分 & \\small\\color{muted}给分条件与中间档\\\\
\\midrule
\\endfirsthead
\\toprule
\\small\\color{muted}评分点 & \\small\\color{muted}满分 & \\small\\color{muted}给分条件与中间档\\\\
\\midrule
\\endhead
${criteriaRows(rubric)}
\\bottomrule
\\end{longtable}
\\vspace{3mm}
{\\bfseries\\large 部分分与非叠加规则}\\par\\vspace{1mm}
\\begin{tcolorbox}[enhanced,colback=white,colframe=line,arc=1mm,boxrule=0.5pt,left=4mm,right=4mm,top=3mm,bottom=3mm]
\\begin{itemize}[leftmargin=5mm,itemsep=1.2mm,topsep=1mm]
${partialRows(rubric)}
\\end{itemize}
\\end{tcolorbox}
\\vspace{3mm}
{\\bfseries\\large 实质给分门禁与零分情形}\\par\\vspace{1mm}
\\begin{tcolorbox}[enhanced,colback=paper,colframe=accent,arc=1mm,boxrule=0.6pt,left=4mm,right=4mm,top=3mm,bottom=3mm]
{\\small\\bfseries 只有形成可核验的正确子结论、完整方向或完整构造，才可得分。}{\\color{muted}\\small 思路正确但没有正确结论、只写答案、只写开头或框架，均记 0 分。}\\par\\vspace{1.5mm}
\\begin{itemize}[leftmargin=5mm,itemsep=1.2mm,topsep=1mm]
${zeroRows(rubric)}
\\end{itemize}
\\end{tcolorbox}
{\\bfseries\\large 关于“结论是否平凡”}\\par\\vspace{1mm}
\\begin{tcolorbox}[enhanced,colback=paper,colframe=line,arc=1mm,boxrule=0.4pt,left=4mm,right=4mm,top=3mm,bottom=3mm]
${rich(rubric.triviality || '先判断每一步是否只是平凡变形、直接套用定义或重复题设。真正推进结论的关键构造、估计与分类讨论才给主要分值；只完成较简单的方向（如组合题中的构造）按实际贡献给部分分，不自动给满分。')}
\\end{tcolorbox}
\\vspace{4mm}
{\\color{muted}\\scriptsize 本评分标准在正式评分前生成，用于固定评分点、允许档位与部分分规则。若与官方评分标准冲突，以用户上传的官方文件为准。}
\\end{document}
`;
}

export async function buildRubricPdf(rubric) {
  await ensureDirs();
  const bin = await findTexBinary();
  if (!bin) throw new Error('服务器未安装 XeLaTeX，无法生成评分标准 PDF。');
  const work = path.join(TMP_DIR, `rubric-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`);
  await fs.mkdir(work, { recursive: true });
  try {
    const tex = buildRubricLatex(rubric);
    await fs.writeFile(path.join(work, 'rubric.tex'), tex, 'utf8');
    let result;
    for (let pass = 0; pass < 2; pass += 1) {
      result = await runXeLatex(bin, work, 'rubric.tex');
      if (result.code !== 0) break;
    }
    if (!result || result.code !== 0) {
      const tail = `${result?.stdout || ''}\n${result?.stderr || ''}`.split('\n').filter((line) => /^!|error|Emergency|Fatal|\.tex:\d+/.test(line)).slice(-12).join('\n');
      throw new Error(`评分标准 PDF 排版失败${tail ? `：${tail.slice(0, 1000)}` : ''}`);
    }
    return await fs.readFile(path.join(work, 'rubric.pdf'));
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
