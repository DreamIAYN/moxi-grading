import fs from 'node:fs/promises';
import { existsSync, constants as FS_CONSTANTS } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { DATA_DIR, TMP_DIR, ensureDirs } from './store.mjs';

const SEV_COLORS = {
  correct: { tex: 'pass', hex: '2F6B4F' },
  error: { tex: 'fail', hex: 'B23A2C' },
  warning: { tex: 'warn', hex: 'A56A16' },
  info: { tex: 'hint', hex: '315C86' },
};
const SEV_LABELS = { correct: '成立', error: '错误', warning: '待补', info: '提示' };

let cachedTexBinary;
let cachedTexVersion;

export async function findTexBinary() {
  if (cachedTexBinary !== undefined) return cachedTexBinary;
  const envBin = process.env.TEX_BIN;
  const candidates = [];
  if (envBin) {
    candidates.push(envBin.endsWith('xelatex') ? envBin : path.join(envBin, 'xelatex'));
  }
  candidates.push(
    path.join(os.homedir(), 'texlive', '2026', 'bin', 'x86_64-linux', 'xelatex'),
    path.join(os.homedir(), 'texlive', '2025', 'bin', 'x86_64-linux', 'xelatex'),
    '/usr/local/texlive/2026/bin/x86_64-linux/xelatex',
    '/usr/local/texlive/2025/bin/x86_64-linux/xelatex',
    '/usr/bin/xelatex',
    '/usr/local/bin/xelatex',
  );
  for (const candidate of candidates) {
    try {
      await fs.access(candidate, FS_CONSTANTS.X_OK);
      cachedTexBinary = candidate;
      return candidate;
    } catch {
      // Continue.
    }
  }
  // Last chance: PATH lookup.
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, 'xelatex');
    if (existsSync(candidate)) {
      cachedTexBinary = candidate;
      return candidate;
    }
  }
  cachedTexBinary = null;
  return null;
}

export async function texStatus() {
  const bin = await findTexBinary();
  if (!bin) return { available: false, version: '' };
  if (cachedTexVersion) return { available: true, version: cachedTexVersion };
  const version = await new Promise((resolve) => {
    const child = spawn(bin, ['--version'], {
      env: { ...process.env, PATH: `${path.dirname(bin)}:${process.env.PATH || ''}` },
    });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.on('error', () => resolve('XeLaTeX'));
    child.on('close', () => resolve(out.split('\n')[0]?.trim() || 'XeLaTeX'));
  });
  cachedTexVersion = version;
  return { available: true, version };
}

export function escapeLatex(value, plainMath = false) {
  let text = String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\uFE0F\u200D]/g, '')
    .replace(/\u00a0/g, ' ');
  if (!plainMath) {
    // Preserve TeX math segments while escaping everything around them.
    const segments = [];
    const pattern = /(\$\$[\s\S]*?\$\$|\$[^$\n]*?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g;
    let last = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > last) segments.push({ math: false, value: text.slice(last, match.index) });
      segments.push({ math: true, value: match[0] });
      last = match.index + match[0].length;
    }
    if (last < text.length) segments.push({ math: false, value: text.slice(last) });
    return segments
      .map((segment) => {
        if (!segment.math) return escapePlain(segment.value);
        let math = segment.value;
        if (math.startsWith('$$')) math = `\\[${math.slice(2, -2)}\\]`;
        else if (math.startsWith('\\[')) math = math;
        else if (math.startsWith('\\(')) math = `$${math.slice(2, -2)}$`;
        math = math
          .replace(/\\(?:label|tag|input|include|write|read|openout|catcode|csname|def|newcommand|renewcommand|usepackage|documentclass)\b[^\n]*/g, '')
          .replace(/\$\$([\s\S]*?)\$\$/g, (_, inner) => `\\[${inner}\\]`);
        return math;
      })
      .join('');
  }
  return escapePlain(text);
}

const UNICODE_MATH = [
  ['≤', '\\le '], ['≥', '\\ge '], ['≠', '\\ne '], ['≈', '\\approx '], ['≡', '\\equiv '],
  ['±', '\\pm '], ['×', '\\times '], ['÷', '\\div '], ['∞', '\\infty '], ['∠', '\\angle '],
  ['△', '\\triangle '], ['⊥', '\\perp '], ['∥', '\\parallel '], ['→', '\\to '], ['⇒', '\\Rightarrow '],
  ['⇔', '\\Leftrightarrow '], ['∈', '\\in '], ['∉', '\\notin '], ['⊂', '\\subset '], ['⊆', '\\subseteq '],
  ['∪', '\\cup '], ['∩', '\\cap '], ['∅', '\\varnothing '], ['∑', '\\sum '], ['∏', '\\prod '],
  ['√', '\\surd '], ['∵', '\\because '], ['∴', '\\therefore '], ['°', '^{\\circ}'], ['′', "'"],
  ['″', "''"], ['…', '\\ldots '], ['−', '-'], ['–', '--'], ['—', '---'], ['～', '\\sim '],
];
const ESCAPES = {
  '\\': '\\textbackslash{}',
  '&': '\\&',
  '%': '\\%',
  '$': '\\$',
  '#': '\\#',
  '_': '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
};
const LATEX_SPECIAL_RE = /[\\&%$#_{}~^]/g;

function escapePlain(text) {
  let out = '';
  let buffer = '';
  const flush = () => {
    if (!buffer) return;
    out += buffer.replace(LATEX_SPECIAL_RE, (ch) => ESCAPES[ch]);
    buffer = '';
  };
  for (const ch of text) {
    const math = UNICODE_MATH.find(([symbol]) => symbol === ch);
    if (math) {
      flush();
      out += `$${math[1]}$`;
    } else {
      buffer += ch;
    }
  }
  flush();
  return out;
}

let activePlainMath = false;

export function rich(value) {
  let text = escapeLatex(value, activePlainMath);
  text = text
    .replace(/\*\*([^*\n]+)\*\*/g, '\\textbf{$1}')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '\\textbullet\\, ');
  const lines = text.split('\n');
  const out = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (out.length && out[out.length - 1] !== '\\par') out.push('\\par');
    } else {
      out.push(line.trim());
    }
  }
  return out.join(' ').replace(/(?:\\par\s*){3,}/g, '\\par\\par').trim();
}

function fmt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function colorFor(severity) {
  return SEV_COLORS[severity] || SEV_COLORS.info;
}

function annotationBlock(annotation, index) {
  const sev = colorFor(annotation.severity);
  const delta = Number.isFinite(Number(annotation.delta)) && Number(annotation.delta) !== 0
    ? `${Number(annotation.delta) > 0 ? '+' : ''}${fmt(annotation.delta)} 分`
    : '—';
  return `\\needspace{5\\baselineskip}\\par\\noindent{\\color{${sev.tex}}\\rule{\\linewidth}{0.7pt}}\\par\\nopagebreak
\\noindent{\\bfseries\\color{${sev.tex}} A${index}\\hspace{1em} ${rich(annotation.title)}}\\hfill{\\scriptsize\\color{${sev.tex}}${SEV_LABELS[annotation.severity] || '提示'}}\\par\\nopagebreak
${rich(annotation.comment)}\\par
${annotation.suggestion ? `\\noindent{\\color{ink}\\bfseries 建议：}${rich(annotation.suggestion)}\\par` : ''}
${annotation.rubric || delta !== '—' ? `\\noindent{\\scriptsize\\color{muted}${annotation.rubric ? `关联评分项：${rich(annotation.rubric)}` : ''}${annotation.rubric && delta !== '—' ? ' \\hspace{1em} ' : ''}${delta !== '—' ? `分数影响：${delta}` : ''}}\\par` : ''}
\\par\\smallskip`;
}

function scoreBar(ratio, color) {
  const clamped = Math.max(0, Math.min(1, Number(ratio) || 0));
  return `\\begin{tikzpicture}[baseline=-0.6ex]\\fill[line!60] (0,0) rectangle (42mm,1.9mm);\\fill[${color}] (0,0) rectangle ({${clamped.toFixed(3)}*42mm},1.9mm);\\end{tikzpicture}`;
}

function coverPage(job) {
  const r = job.result;
  const idShort = job.id.slice(-8).toUpperCase();
  const date = new Date(job.createdAt).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const ratio = r.maxScore > 0 ? r.score / r.maxScore : 0;
  const accent = ratio >= 0.85 ? 'pass' : ratio >= 0.6 ? 'warn' : 'fail';
  return `\\begin{titlepage}
\\thispagestyle{empty}
\\begin{tikzpicture}[remember picture,overlay]
  \\fill[paper] (current page.south west) rectangle (current page.north east);
  \\fill[ink] (current page.north west) rectangle ([yshift=-6mm]current page.north east);
  \\fill[accent] ([yshift=-6mm]current page.north west) rectangle ([yshift=-6.8mm]current page.north east);
  \\node[anchor=north west,text=ink,font=\\small\\bfseries] at ([xshift=18mm,yshift=-16mm]current page.north west) {墨析\\hspace{1em} MOXI\\;\\textperiodcentered\\;GRADING STUDIO};
  \\node[anchor=north east,text=muted,font=\\scriptsize] at ([xshift=-18mm,yshift=-16mm]current page.north east) {REPORT\\;\\textperiodcentered\\;${idShort}};
  \\draw[line,line width=0.4pt] ([xshift=18mm,yshift=30mm]current page.south west) -- ([xshift=-18mm,yshift=30mm]current page.south east);
  \\node[anchor=south west,font=\\scriptsize,text=muted] at ([xshift=18mm,yshift=19mm]current page.south west) {AI 辅助批改 \\textperiodcentered\\ 仅供教学参考 \\textperiodcentered\\ ${date}};
\\end{tikzpicture}
\\vspace*{16mm}
{\\color{accent}\\small\\bfseries MATHEMATICS OLYMPIAD \\;\\textperiodcentered\\; SOLUTION REVIEW}\\par
\\vspace{5mm}
{\\fontsize{31}{40}\\selectfont\\bfseries 数学竞赛解答\\par}
\\vspace{1mm}
{\\fontsize{31}{40}\\selectfont\\bfseries 批改报告\\par}
\\vspace{4mm}
{\\color{accent}\\rule{38mm}{1.4pt}}\\par
\\vspace{9mm}
\\begin{minipage}[t]{0.57\\textwidth}
\\vspace{0pt}
{\\color{muted}\\small 总评}\\par
\\vspace{2mm}
{\\large\\bfseries ${rich(r.summary)}}\\par
\\vspace{7mm}
{\\color{muted}\\small 批改对象}\\par
{\\large ${rich(job.input.studentName || '未署名同学')}}\\par
\\vspace{2mm}
{\\small\\color{muted}${rich(job.input.sourceLabel || job.input.rubricName || '数学竞赛 · 单题')}}\\par
\\vfill
\\begin{tabular}{@{}ll@{}}
\\small\\color{muted}模型 & \\small ${rich(`${job.providerName} / ${job.input.model}`)}\\tabularnewline
\\small\\color{muted}评分标准 & \\small ${rich(job.input.rubricName || '自动研判')}\\tabularnewline
\\small\\color{muted}题型 & \\small ${rich(r.categoryLabel || '其他')}${r.paperMode ? ' · 整卷' : ''}\\tabularnewline
\\small\\color{muted}置信度 & \\small ${Math.round((r.confidence || 0) * 100)}\\%\\tabularnewline
\\end{tabular}
\\end{minipage}\\hfill
\\begin{minipage}[t]{0.38\\textwidth}
\\vspace{0pt}
\\begin{tcolorbox}[enhanced,colback=ink,coltext=white,arc=1.5mm,boxrule=0pt,left=5mm,right=5mm,top=5mm,bottom=5mm]
{\\color{white!65!ink}\\small 本题得分}\\par
\\vspace{2mm}
{\\fontsize{46}{50}\\selectfont\\bfseries ${fmt(r.score)}}\\,{\\large /\\,${fmt(r.maxScore)}}\\par
\\vspace{2mm}
{\\color{${accent}}\\bfseries ${rich(r.gradeLabel)}}\\hfill{\\small ${Math.round(ratio * 100)}\\%}\\par
\\vspace{3mm}
{\\color{white!60!ink}\\scriptsize ${scoreBar(ratio, accent)}}\\par
\\end{tcolorbox}
\\vspace{3mm}
\\begin{tcolorbox}[enhanced,colback=white,colframe=line,arc=1mm,boxrule=0.5pt,left=3mm,right=3mm,top=2.5mm,bottom=2.5mm]
{\\scriptsize\\color{muted}批注数量}\\hfill{\\small\\bfseries ${r.annotations.length} 处}\\par
{\\scriptsize\\color{muted}解答页数}\\hfill{\\small\\bfseries ${job.files.solution.length} 页}\\par
{\\scriptsize\\color{muted}报告编号}\\hfill{\\scriptsize\\ttfamily ${idShort}}\\par
\\end{tcolorbox}
\\end{minipage}
\\vfill
\\end{titlepage}`;
}

function overviewPage(job) {
  const r = job.result;
  const criteriaRows = r.criteria.map((c, index) => `\\small ${index + 1}. ${rich(c.name)} & ${fmt(c.max)} & {\\bfseries ${fmt(c.awarded)}} & {\\scriptsize ${rich(c.reason || '')}}\\\\`).join('\n');
  return `\\clearpage
\\sechead{批改总览}
${r.substantiveGate && !r.substantiveGate.passed ? `\\begin{tcolorbox}[enhanced,colback=paper,colframe=accent,arc=1mm,boxrule=0.7pt,left=5mm,right=5mm,top=3mm,bottom=3mm]
{\\small\\bfseries 未通过实质给分门禁，本题记 0 分}\\par\\vspace{1mm}
{\\small ${rich(r.substantiveGate.reason || '只写答案、只有思路或没有形成可核验的正确结论，均不计分。')}}
\\end{tcolorbox}\\vspace{3mm}` : ''}
\\begin{tcolorbox}[enhanced,colback=white,colframe=line,arc=1mm,boxrule=0.5pt,left=5mm,right=5mm,top=4mm,bottom=4mm]
{\\small\\color{muted}阅卷人总评}\\par\\vspace{1.5mm}
${rich(r.overallComment || r.summary)}
\\end{tcolorbox}
{\\bfseries\\large ${r.paperMode ? '分题评分' : '分项评分'}}\\par\\vspace{3mm}
\\begin{longtable}{@{}>{\\raggedright\\arraybackslash}p{0.29\\textwidth}>{\\centering\\arraybackslash}p{0.08\\textwidth}>{\\centering\\arraybackslash}p{0.08\\textwidth}>{\\raggedright\\arraybackslash}p{0.47\\textwidth}@{}}
\\toprule
\\small\\color{muted}${r.paperMode ? '题目' : '评分项'} & \\small\\color{muted}满分 & \\small\\color{muted}得分 & \\small\\color{muted}依据\\\\
\\midrule
\\endfirsthead
\\toprule
\\small\\color{muted}${r.paperMode ? '题目' : '评分项'} & \\small\\color{muted}满分 & \\small\\color{muted}得分 & \\small\\color{muted}依据\\\\
\\midrule
\\endhead
${criteriaRows}
\\midrule
\\small\\bfseries 合计 & \\bfseries ${fmt(r.maxScore)} & \\bfseries ${fmt(r.score)} & \\\\
\\bottomrule
\\end{longtable}`;
}

function problemPage(job) {
  const r = job.result;
  const problemImages = job.files.problem.map((file) => `\\begin{center}\\includegraphics[width=0.82\\linewidth,height=0.33\\textheight,keepaspectratio]{${file}}\\end{center}`).join('\n');
  const rubricImages = job.files.rubric.map((file) => `\\begin{center}\\includegraphics[width=0.72\\linewidth,height=0.26\\textheight,keepaspectratio]{${file}}\\end{center}`).join('\n');
  const rubricItems = (job.input.rubricItems || []).map((item, i) => `\\small ${i + 1}. ${rich(item.name)} \\hfill ${fmt(item.max)} 分\\par ${item.description ? `{\\scriptsize\\color{muted}${rich(item.description)}}\\par` : ''}`).join('\n');
  return `\\clearpage
\\sechead{题目与评分依据}
{\\bfseries 题目}\\par\\vspace{1.5mm}
\\begin{tcolorbox}[enhanced,colback=white,colframe=line,arc=1mm,boxrule=0.5pt,left=4mm,right=4mm,top=3mm,bottom=3mm]
${rich(job.input.problemText || '（题目见下图）')}
\\end{tcolorbox}
${problemImages ? `\\vspace{2mm}${problemImages}` : ''}
\\vspace{3mm}
{\\bfseries 评分标准：${rich(job.input.rubricName || '自动研判')}}\\par\\vspace{1.5mm}
{\\small\\color{muted}题型：${rich(r.categoryLabel || '其他')}\\hspace{1em}${r.paperMode ? '整卷模式 · 按题给分' : `评分单位：${fmt(r.scoreUnit || job.input.scoreUnit || 1)} 分/点`}${r.generatedRubric ? '\\hspace{1em} 本题评分标准已于评分前单独生成 PDF' : ''}}\\par\\vspace{2mm}
${rubricItems ? `\\begin{tcolorbox}[breakable,enhanced,colback=paper,colframe=line,arc=1mm,boxrule=0.4pt,left=4mm,right=4mm,top=3mm,bottom=3mm]${rubricItems}\\end{tcolorbox}` : ''}
${job.input.rubricText ? `\\begin{tcolorbox}[enhanced,colback=white,colframe=line,arc=1mm,boxrule=0.4pt,left=4mm,right=4mm,top=3mm,bottom=3mm]{\\small\\color{muted}${r.generatedRubric ? '评分标准摘要 / 生成说明' : '用户提供的答案 / 评分依据'}}\\par\\vspace{1mm}${rich(job.input.rubricText)}\\end{tcolorbox}` : ''}
${rubricImages}
${!job.input.problemText && !problemImages ? '{\\color{muted}未提供题目内容。}' : ''}`;
}

function solutionPages(job) {
  const r = job.result;
  if (!job.files.solution.length) return '';
  const globalIndex = new Map();
  r.annotations.forEach((annotation, index) => globalIndex.set(annotation.id, index + 1));
  return job.files.solution.map((file, pageIndex) => {
    const pageNo = pageIndex + 1;
    const pageAnnotations = r.annotations.filter((annotation) => annotation.page === pageNo);
    const located = pageAnnotations.filter((a) => a.w > 0.002 && a.h > 0.002);
    const boxes = located.map((a) => {
      const sev = colorFor(a.severity);
      const idx = globalIndex.get(a.id);
      const bottom = 1 - a.y - a.h;
      return `\\fill[${sev.tex},opacity=0.11] (${a.x.toFixed(4)},${bottom.toFixed(4)}) rectangle (${(a.x + a.w).toFixed(4)},${(1 - a.y).toFixed(4)});
\\draw[${sev.tex},line width=0.9pt] (${a.x.toFixed(4)},${bottom.toFixed(4)}) rectangle (${(a.x + a.w).toFixed(4)},${(1 - a.y).toFixed(4)});
\\node[circle,fill=${sev.tex},text=white,inner sep=1.1pt,font=\\scriptsize\\bfseries,anchor=south east] at (${a.x.toFixed(4)},${(1 - a.y).toFixed(4)}) {A${idx}};`;
    }).join('\n');
    const blocks = pageAnnotations.length
      ? pageAnnotations.map((a) => annotationBlock(a, globalIndex.get(a.id))).join('\n')
      : '{\\color{muted}本页没有逐点定位批注。}\\par';
    const box = `\\begin{tcolorbox}[breakable,enhanced,colback=white,colframe=line,arc=1mm,boxrule=0.5pt,left=3.5mm,right=3.5mm,top=3mm,bottom=3mm,title={\\bfseries 第 ${pageNo} 页批注},coltitle=white,colbacktitle=ink,fonttitle=\\small,attach boxed title to top left={xshift=2mm,yshift=-2mm},boxed title style={arc=1mm,boxrule=0pt}]\\small ${blocks}\\end{tcolorbox}`;
    return `\\clearpage
\\sechead{手写解答 \\textperiodcentered\\ 第 ${pageNo} 页 / 共 ${job.files.solution.length} 页}
{\\scriptsize\\color{muted}色标：{\\color{pass}$\\blacksquare$} 成立\\hspace{1em}{\\color{fail}$\\blacksquare$} 错误\\hspace{1em}{\\color{warn}$\\blacksquare$} 待补\\hspace{1em}{\\color{hint}$\\blacksquare$} 提示\\hfill 批注框由模型定位，仅供对照}\\par\\vspace{2mm}
\\begin{center}
\\begin{tikzpicture}
\\node[anchor=south west,inner sep=0] (img) at (0,0) {\\includegraphics[width=\\linewidth,height=0.64\\textheight,keepaspectratio]{${file}}};
\\begin{scope}[x={(img.south east)},y={(img.north west)}]
${boxes}
\\end{scope}
\\end{tikzpicture}
\\end{center}
\\vspace{3mm}
${box}`;
  }).join('\n');
}

function finalPage(job) {
  const r = job.result;
  const list = (items, color) => (items?.length
    ? `\\begin{itemize}[leftmargin=5mm,itemsep=1.2mm,topsep=1mm]${items.map((item) => `\\item ${rich(item)}`).join('')}\\end{itemize}`
    : '{\\color{muted}暂无。}');
  return `\\clearpage
\\sechead{总评与下一步}
\\begin{minipage}[t]{0.485\\textwidth}
\\begin{tcolorbox}[enhanced,colback=pass!7,colframe=pass,arc=1mm,boxrule=0.4pt,left=3mm,right=3mm,top=3mm,bottom=3mm]
{\\bfseries\\color{pass} 做得好的地方}\\par\\vspace{1mm}
${list(r.strengths, 'pass')}
\\end{tcolorbox}
\\end{minipage}\\hfill
\\begin{minipage}[t]{0.485\\textwidth}
\\begin{tcolorbox}[enhanced,colback=fail!6,colframe=fail,arc=1mm,boxrule=0.4pt,left=3mm,right=3mm,top=3mm,bottom=3mm]
{\\bfseries\\color{fail} 优先改进}\\par\\vspace{1mm}
${list(r.improvements, 'fail')}
\\end{tcolorbox}
\\end{minipage}
\\par\\vspace{6mm}
{\\bfseries\\large 建议的下一步}\\par\\vspace{1mm}
\\begin{tcolorbox}[enhanced,colback=white,colframe=line,arc=1mm,boxrule=0.5pt,left=4mm,right=4mm,top=3mm,bottom=3mm]
${list(r.nextSteps, 'hint')}
\\end{tcolorbox}
\\par\\vspace{6mm}
{\\bfseries\\large 阅卷说明}\\par\\vspace{1mm}
\\begin{tcolorbox}[enhanced,colback=paper,colframe=line,arc=1mm,boxrule=0.4pt,left=4mm,right=4mm,top=3mm,bottom=3mm]
{\\small
本报告由 ${rich(job.providerName)} 的 ${rich(job.input.model)} 生成，采用“${rich(strictnessLabel(job.input.strictness))}”尺度。分数与批注用于教学反馈，不构成正式竞赛成绩。\\
\\vspace{1mm}
{\\color{muted}模型：${rich(job.providerName)} / ${rich(job.input.model)}\\hspace{1em} 尺度：${rich(strictnessLabel(job.input.strictness))}}\\par
{\\color{muted}原则：不另做参考解；先按学生解答重建其实际路线；只评价卷面已写出的步骤；跳步按可补步骤扣分；等号、边界与退化情形单列检查；批注坐标为模型估计。}\\par
{\\color{muted}若手写识别存在歧义，请以原卷为准并结合教师复核。报告生成时间：${new Date(job.createdAt).toLocaleString('zh-CN')}。}
}
\\end{tcolorbox}
\\vfill
{\\centering\\color{muted}\\scriptsize 墨析 · 让每一处推导都有回应\\par}`;
}

function strictnessLabel(value) {
  return { standard: '标准', strict: '从严', encouraging: '鼓励' }[value] || '标准';
}

export function buildLatex(job, { plainMath = false } = {}) {
  activePlainMath = plainMath;
  const idShort = job.id.slice(-8).toUpperCase();
  return `\\documentclass[UTF8,fontset=fandol,11pt]{ctexart}
\\usepackage[a4paper,top=22mm,bottom=20mm,left=19mm,right=19mm,headheight=14pt]{geometry}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{tikz}
\\usetikzlibrary{calc,positioning}
\\usepackage[most]{tcolorbox}
\\usepackage{xcolor}
\\usepackage{booktabs,tabularx,array,longtable}
\\usepackage{enumitem}
\\usepackage{fancyhdr}
\\usepackage{needspace}
\\usepackage{lastpage}
\\usepackage[hidelinks]{hyperref}
\\usepackage{microtype}
\\definecolor{paper}{HTML}{F8F5EC}
\\definecolor{ink}{HTML}{1D2430}
\\definecolor{muted}{HTML}{6D6A61}
\\definecolor{line}{HTML}{DCD4C4}
\\definecolor{accent}{HTML}{B33A2B}
\\definecolor{pass}{HTML}{2F6B4F}
\\definecolor{fail}{HTML}{B23A2C}
\\definecolor{warn}{HTML}{A56A16}
\\definecolor{hint}{HTML}{315C86}
\\setlength{\\parindent}{0pt}
\\sloppy
\\setlength{\\emergencystretch}{2em}
\\setlength{\\parskip}{4pt}
\\renewcommand{\\arraystretch}{1.32}
\\setlist[itemize]{label={\\color{accent}\\textbullet}}
\\ctexset{section/format=\\Large\\bfseries\\color{ink}}
\\providecommand{\\textperiodcentered}{\\ensuremath{\\cdot}}
\\newcommand{\\sechead}[1]{\\vspace{1mm}{\\color{accent}\\rule{9mm}{1.4pt}}\\hspace{2.5mm}{\\LARGE\\bfseries #1}\\par\\vspace{3mm}}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\small\\color{muted}墨析 \\textperiodcentered\\ 数学竞赛批改}
\\fancyhead[R]{\\small\\color{muted}REPORT / ${idShort}}
\\fancyfoot[L]{\\scriptsize\\color{muted}AI 辅助批改 \\textperiodcentered\\ 建议结合人工复核}
\\fancyfoot[R]{\\small\\color{muted}\\thepage\\,/\\,\\pageref{LastPage}}
\\renewcommand{\\headrulewidth}{0.3pt}
\\renewcommand{\\headrule}{\\hbox to\\headwidth{\\color{line}\\leaders\\hrule height \\headrulewidth\\hfill}}
\\hypersetup{pdftitle={数学竞赛解答批改报告},pdfauthor={墨析 MOXI},pdfsubject={AI-assisted olympiad grading report}}
\\begin{document}
${coverPage(job)}
${overviewPage(job)}
${problemPage(job)}
${solutionPages(job)}
${finalPage(job)}
\\end{document}
`;
}

export function runXeLatex(bin, cwd, texFile) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      PATH: `${path.dirname(bin)}:${process.env.PATH || ''}`,
      TEXMFVAR: path.join(DATA_DIR, 'texmf-var'),
      TEXMFCACHE: path.join(DATA_DIR, 'texmf-cache'),
      openout_any: 'p',
      openin_any: 'p',
    };
    const child = spawn(bin, ['-interaction=nonstopmode', '-halt-on-error', '-file-line-error', texFile], {
      cwd,
      env,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 90_000);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: String(error) });
    });
  });
}

async function convertWebpToPng(filePath) {
  if (!filePath.endsWith('.webp')) return filePath;
  const png = filePath.replace(/\.webp$/, '.png');
  const code = 'import sys\nfrom PIL import Image\nImage.open(sys.argv[1]).convert("RGB").save(sys.argv[2], "PNG")';
  await new Promise((resolve, reject) => {
    const child = spawn('python3', ['-c', code, filePath, png]);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error('WEBP 转换失败'))));
    child.on('error', reject);
  });
  return path.basename(png);
}

const pdfLocks = new Map();

export async function generatePdf(job) {
  const key = job.id;
  if (pdfLocks.has(key)) return pdfLocks.get(key);
  const task = generatePdfUnlocked(job).finally(() => pdfLocks.delete(key));
  pdfLocks.set(key, task);
  return task;
}

async function generatePdfUnlocked(job) {
  await ensureDirs();
  const bin = await findTexBinary();
  if (!bin) throw new Error('服务器未安装 XeLaTeX，无法生成 PDF。请安装 TeX Live 或设置 TEX_BIN。');
  const jobDir = path.join(DATA_DIR, 'jobs', job.id);
  const pdfPath = path.join(jobDir, 'report.pdf');
  try {
    const cached = await fs.readFile(pdfPath);
    if (cached.length > 1024 && cached.subarray(-32).includes(Buffer.from('%%EOF'))) return pdfPath;
    await fs.rm(pdfPath, { force: true });
  } catch {
    // Not cached yet.
  }

  const work = path.join(TMP_DIR, `pdf-${job.id}-${Date.now().toString(36)}`);
  await fs.mkdir(work, { recursive: true });
  try {
    const sourceDir = path.join(DATA_DIR, 'jobs', job.id);
    const files = {};
    for (const group of ['problem', 'solution', 'rubric']) {
      files[group] = [];
      for (const file of job.files[group]) {
        let copyName = `${group}-${files[group].length + 1}${path.extname(file)}`;
        let src = path.join(sourceDir, file);
        if (file.endsWith('.webp')) {
          const converted = await convertWebpToPng(src);
          src = path.join(sourceDir, converted);
          copyName = copyName.replace(/\.webp$/, '.png');
        }
        await fs.copyFile(src, path.join(work, copyName));
        files[group].push(copyName);
      }
    }
    const localJob = { ...job, files };
    let lastLog = '';
    for (const plainMath of [false, true]) {
      const tex = buildLatex(localJob, { plainMath });
      await fs.writeFile(path.join(work, 'report.tex'), tex, 'utf8');
      const first = await runXeLatex(bin, work, 'report.tex');
      if (first.code !== 0) {
        lastLog = `${first.stdout}\n${first.stderr}`;
        continue;
      }
      // Second pass resolves LastPage.
      const second = await runXeLatex(bin, work, 'report.tex');
      if (second.code !== 0) {
        lastLog = `${second.stdout}\n${second.stderr}`;
        continue;
      }
      const tmpPdf = `${pdfPath}.tmp`;
      await fs.copyFile(path.join(work, 'report.pdf'), tmpPdf);
      await fs.rename(tmpPdf, pdfPath);
      return pdfPath;
    }
    const tail = lastLog.split('\n').filter((line) => /^!|error|Emergency|Fatal|\.tex:\d+/.test(line)).slice(-20).join('\n');
    throw new Error(`PDF 排版失败${tail ? `：${tail.slice(0, 1400)}` : ''}`);
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
