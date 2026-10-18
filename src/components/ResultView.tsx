import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowLeft,
  BookMarked,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  FileText,
  LoaderCircle,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  ZoomIn,
} from 'lucide-react';
import {
  SEVERITY_META,
  formatDate,
  scoreTone,
} from '../lib';
import { pdfUrl } from '../api';
import type { Annotation, GradingResult } from '../types';
import MathText from './MathText';

interface ResultViewProps {
  result: GradingResult;
  onBack: () => void;
  onNew: () => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'error') => void;
}

type Filter = 'all' | 'issues' | 'correct';

export default function ResultView({ result, onBack, onNew, onToast }: ResultViewProps) {
  const [activePage, setActivePage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(result.annotations[0]?.id || null);
  const [zoom, setZoom] = useState(1);
  const [filter, setFilter] = useState<Filter>('all');
  const [pdfBusy, setPdfBusy] = useState(false);
  const annotationRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const ratio = result.maxScore > 0 ? result.score / result.maxScore : 0;
  const tone = scoreTone(ratio);
  const currentPageAnnotations = useMemo(
    () => result.annotations.filter((annotation) => annotation.page === activePage),
    [result.annotations, activePage],
  );
  const filteredAnnotations = useMemo(() => {
    if (filter === 'issues') return currentPageAnnotations.filter((a) => a.severity === 'error' || a.severity === 'warning');
    if (filter === 'correct') return currentPageAnnotations.filter((a) => a.severity === 'correct');
    return currentPageAnnotations;
  }, [currentPageAnnotations, filter]);
  const issueCount = result.annotations.filter((a) => a.severity === 'error').length;
  const warningCount = result.annotations.filter((a) => a.severity === 'warning').length;
  const correctCount = result.annotations.filter((a) => a.severity === 'correct').length;
  const paperFull = result.questions?.filter((q) => q.max > 0 && q.score >= q.max).length || 0;
  const paperPartial = result.questions?.filter((q) => q.score > 0 && q.score < q.max).length || 0;
  const paperZero = result.questions?.filter((q) => q.score <= 0).length || 0;

  useEffect(() => {
    if (currentPageAnnotations.length && !currentPageAnnotations.some((a) => a.id === selectedId)) {
      setSelectedId(currentPageAnnotations[0].id);
    }
  }, [activePage, currentPageAnnotations, selectedId]);

  function pickAnnotation(annotation: Annotation) {
    setSelectedId(annotation.id);
    const node = annotationRefs.current.get(annotation.id);
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const response = await fetch(pdfUrl(result.id));
      if (!response.ok) {
        let message = 'PDF 生成失败';
        try {
          const data = await response.json();
          message = data.error || message;
        } catch {
          // Keep default.
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `墨析批改报告-${result.studentName || result.id}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 3000);
      onToast('PDF 报告已生成。', 'success');
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'PDF 生成失败', 'error');
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="result-view">
      <div className="result-toolbar">
        <button className="back-button" onClick={onBack}><ArrowLeft size={16} /> 返回批改台</button>
        <div className="result-toolbar-actions">
          <button className="ghost-button" onClick={onNew}><RotateCcw size={15} /> 批改下一题</button>
          <button className="download-button" onClick={downloadPdf} disabled={pdfBusy}>
            {pdfBusy ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
            {pdfBusy ? '正在排版…' : '下载 PDF 报告'}
          </button>
        </div>
      </div>

      {result.warnings?.length ? (
        <div className="warning-banner">
          <CircleAlert size={16} />
          <div>
            {result.warnings.map((warning, index) => <p key={index}>{warning}</p>)}
          </div>
        </div>
      ) : null}

      {result.substantiveGate && !result.substantiveGate.passed ? (
        <div className="gate-banner">
          <CircleAlert size={17} />
          <div>
            <strong>未通过实质给分门禁，本题记 0 分</strong>
            <p>{result.substantiveGate.reason || '只写答案、只有思路或没有形成可核验的正确结论，均不计分。'}</p>
          </div>
        </div>
      ) : null}

      {result.demo && (
        <div className="demo-banner">
          <Sparkles size={16} />
          <span><strong>演示报告</strong> · 本次未调用外部模型，内容为内置示例，用于展示批改流程与 PDF 版式。接入 API Key 后可批改你自己的题目。</span>
        </div>
      )}

      <section className="report-header">
        <div className="report-header-copy">
          <div className="eyebrow"><FileText size={13} /> GRADING REPORT · {result.id.slice(-8).toUpperCase()}</div>
          <h1>{result.studentName || '未署名同学'}的<span>批改报告</span></h1>
          <p className="report-subtitle">{result.sourceLabel || result.rubricName || '数学竞赛 · 单题'} · {formatDate(result.createdAt)}</p>
          <div className="report-meta">
            <span><b>{result.providerName}</b> / {result.model}</span>
            <span>评分标准 <b>{result.rubricName}</b></span>
            <span>置信度 <b>{Math.round(result.confidence * 100)}%</b></span>
            {result.elapsedMs ? <span>用时 <b>{Math.round(result.elapsedMs / 1000)}s</b></span> : null}
            {result.categoryLabel ? <span>题型 <b>{result.categoryLabel}</b></span> : null}
            {result.paperMode ? <span><b>整卷 · 按题给分</b></span> : result.scoreUnit ? <span>评分单位 <b>{result.scoreUnit} 分/点</b></span> : null}
          </div>
        </div>
        <div className="report-score" style={{ '--tone': tone.color } as CSSProperties}>
          <div className="score-label">本题得分</div>
          <div className="score-number">
            <strong>{Number.isInteger(result.score) ? result.score : result.score.toFixed(1)}</strong>
            <span>/ {Number.isInteger(result.maxScore) ? result.maxScore : result.maxScore.toFixed(1)}</span>
          </div>
          <div className="score-bar"><span style={{ width: `${Math.round(ratio * 100)}%` }} /></div>
          <div className="score-foot">
            <span className="grade-chip">{result.gradeLabel}</span>
            <span>{Math.round(ratio * 100)}%</span>
          </div>
        </div>
      </section>

      <div className="quick-stats">
        {result.paperMode && result.questions?.length ? (
          <>
            <div><span className="stat-icon is-green"><CheckCircle2 size={16} /></span><strong>{paperFull}</strong><small>满分题</small></div>
            <div><span className="stat-icon is-amber"><Target size={16} /></span><strong>{paperPartial}</strong><small>部分分题</small></div>
            <div><span className="stat-icon is-red"><CircleAlert size={16} /></span><strong>{paperZero}</strong><small>零分题</small></div>
            <div><span className="stat-icon is-blue"><BookMarked size={16} /></span><strong>{result.annotations.length}</strong><small>逐处批注</small></div>
          </>
        ) : (
          <>
            <div><span className="stat-icon is-green"><CheckCircle2 size={16} /></span><strong>{correctCount}</strong><small>成立步骤</small></div>
            <div><span className="stat-icon is-red"><CircleAlert size={16} /></span><strong>{issueCount}</strong><small>明确错误</small></div>
            <div><span className="stat-icon is-amber"><Target size={16} /></span><strong>{warningCount}</strong><small>待补 / 跳步</small></div>
            <div><span className="stat-icon is-blue"><BookMarked size={16} /></span><strong>{result.annotations.length}</strong><small>逐处批注</small></div>
          </>
        )}
      </div>

      {result.paperMode && result.questions?.length ? (
        <section className="paper-scoreboard">
          <div className="paper-scoreboard-title">
            <span className="eyebrow">PAPER SCOREBOARD</span>
            <h2>分题得分</h2>
            <span>{result.questions.length} 题 · 合计 {result.score} / {result.maxScore}</span>
          </div>
          <div className="paper-score-grid">
            {result.questions.map((question) => {
              const ratio = question.max > 0 ? question.score / question.max : 0;
              return (
                <div className={`paper-score-item ${ratio >= 0.999 ? 'is-full' : question.score > 0 ? 'is-partial' : 'is-miss'}`} key={question.no}>
                  <span className="paper-qno">第 {question.no} 题</span>
                  <strong>{question.score}<small> / {question.max}</small></strong>
                  <span>{question.type}{question.topic && !question.topic.includes(question.type) ? ` · ${question.topic}` : ''}</span>
                  {question.substantive === false ? <em className="gate-tag">未达实质门槛</em> : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {(result.problemText || result.problemImages.length > 0) && (
        <details className="problem-peek">
          <summary>
            <span><BookOpen size={15} /> 题目原文</span>
            <small>{result.problemText ? '点击展开' : '题目图片'}</small>
          </summary>
          <div className="problem-peek-body">
            {result.problemText ? <MathText>{result.problemText}</MathText> : null}
            {result.problemImages.length > 0 && (
              <div className="problem-peek-images">
                {result.problemImages.map((src, index) => (
                  <a key={src} href={src} target="_blank" rel="noreferrer">
                    <img src={src} alt={`题目图 ${index + 1}`} />
                  </a>
                ))}
              </div>
            )}
          </div>
        </details>
      )}

      <section className="report-section summary-section">
        <div className="section-heading">
          <div><span className="section-no">01</span><h2>阅卷人总评</h2></div>
          <span className="section-en">OVERVIEW</span>
        </div>
        <div className="summary-grid">
          <div className="summary-copy">
            <MathText>{result.overallComment}</MathText>
          </div>
          <div className="summary-side">
            <div className="summary-quote">
              <span className="quote-mark">“</span>
              <p>{result.summary}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="report-section annotation-section">
        <div className="section-heading">
          <div><span className="section-no">02</span><h2>手写稿逐处批注</h2></div>
          <span className="section-en">ANNOTATED PAGES · {result.solutionImages.length}</span>
        </div>
        <p className="section-intro">彩色框已按原图坐标叠回手写页。多页解答可用上方页码或缩略图切换；点击框或右侧条目，可对照查看具体错因与补写建议。坐标由模型估算，若与原稿有轻微偏移，以文字批注为准。</p>

        <div className="annotation-layout">
          <div className="viewer-panel">
            <div className="viewer-toolbar">
              <div className="page-tabs">
                {result.solutionImages.map((_, index) => (
                  <button
                    key={index}
                    className={activePage === index + 1 ? 'is-active' : ''}
                    onClick={() => setActivePage(index + 1)}
                  >
                    第 {index + 1} 页
                    <small>{result.annotations.filter((a) => a.page === index + 1).length}</small>
                  </button>
                ))}
              </div>
              <div className="viewer-zoom">
                {result.solutionImages.length > 1 && <b className="viewer-page-count">{activePage} / {result.solutionImages.length}</b>}
                <button onClick={() => setZoom((value) => Math.max(0.75, Number((value - 0.25).toFixed(2))))} aria-label="缩小"><Minus size={14} /></button>
                <span>{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom((value) => Math.min(2.5, Number((value + 0.25).toFixed(2))))} aria-label="放大"><Plus size={14} /></button>
              </div>
            </div>
            {result.solutionImages.length > 1 && (
              <div className="page-thumbnails" aria-label="解答页选择">
                {result.solutionImages.map((url, index) => (
                  <button
                    key={url}
                    className={activePage === index + 1 ? 'is-active' : ''}
                    onClick={() => setActivePage(index + 1)}
                    aria-label={`查看第 ${index + 1} 页`}
                  >
                    <img src={url} alt="" />
                    <span>{index + 1}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="viewer-scroll">
              <div className="image-stage" style={{ width: `${zoom * 100}%` }}>
                <img src={result.solutionImages[activePage - 1]} alt={`手写解答第 ${activePage} 页`} />
                <div className="annotation-layer">
                  {filteredAnnotations.filter((a) => a.w > 0.002 && a.h > 0.002).map((annotation) => {
                    const meta = SEVERITY_META[annotation.severity];
                    const index = result.annotations.findIndex((a) => a.id === annotation.id) + 1;
                    return (
                      <button
                        key={annotation.id}
                        className={`annotation-box ${selectedId === annotation.id ? 'is-selected' : ''}`}
                        style={{
                          left: `${annotation.x * 100}%`,
                          top: `${annotation.y * 100}%`,
                          width: `${annotation.w * 100}%`,
                          height: `${annotation.h * 100}%`,
                          borderColor: meta.color,
                          background: `${meta.color}1c`,
                        }}
                        onClick={() => pickAnnotation(annotation)}
                        aria-label={`批注 ${index}：${annotation.title}`}
                      >
                        <span className="annotation-marker" style={{ background: meta.color }}>{index}</span>
                        {selectedId === annotation.id && <span className="annotation-caption" style={{ borderColor: meta.color }}>{annotation.title}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="viewer-footer">
              <div className="filter-chips">
                {([
                  ['all', '全部'],
                  ['issues', '只看问题'],
                  ['correct', '只看亮点'],
                ] as const).map(([key, label]) => (
                  <button key={key} className={filter === key ? 'is-active' : ''} onClick={() => setFilter(key)}>{label}</button>
                ))}
              </div>
              <span><ZoomIn size={12} /> 可缩放查看细节</span>
            </div>
          </div>

          <div className="annotation-panel">
            <div className="annotation-panel-head">
              <div>
                <h3>第 {activePage} 页批注</h3>
                <span>{filteredAnnotations.length} 条</span>
              </div>
              <div className="page-nav">
                <button disabled={activePage <= 1} onClick={() => setActivePage((page) => page - 1)}><ChevronLeft size={15} /></button>
                <button disabled={activePage >= result.solutionImages.length} onClick={() => setActivePage((page) => page + 1)}><ChevronRight size={15} /></button>
              </div>
            </div>
            <div className="annotation-cards">
              {filteredAnnotations.length === 0 ? (
                <div className="empty-annotations">
                  <CheckCircle2 size={22} />
                  <strong>{filter === 'all' ? '本页没有定位批注' : '当前筛选下没有条目'}</strong>
                  <p>可切换筛选条件，或查看其他页。</p>
                </div>
              ) : filteredAnnotations.map((annotation) => {
                const meta = SEVERITY_META[annotation.severity];
                const index = result.annotations.findIndex((a) => a.id === annotation.id) + 1;
                return (
                  <div
                    key={annotation.id}
                    ref={(node) => {
                      if (node) annotationRefs.current.set(annotation.id, node);
                      else annotationRefs.current.delete(annotation.id);
                    }}
                    className={`annotation-card ${selectedId === annotation.id ? 'is-selected' : ''}`}
                    style={{ '--sev': meta.color, '--sev-bg': meta.bg } as CSSProperties}
                    onClick={() => pickAnnotation(annotation)}
                  >
                    <div className="annotation-card-head">
                      <span className="annotation-index">{index}</span>
                      <div>
                        <strong>{annotation.title}</strong>
                        {annotation.question ? <span className="question-tag">第 {annotation.question} 题</span> : null}
                        <span className="severity-tag">{meta.label}</span>
                      </div>
                      {annotation.delta !== undefined && annotation.delta !== 0 && (
                        <span className={`delta ${annotation.delta > 0 ? 'is-plus' : ''}`}>{annotation.delta > 0 ? '+' : ''}{annotation.delta}</span>
                      )}
                    </div>
                    <MathText className="annotation-comment">{annotation.comment}</MathText>
                    {annotation.suggestion && (
                      <div className="suggestion">
                        <span>建议写法</span>
                        <MathText>{annotation.suggestion}</MathText>
                      </div>
                    )}
                    <div className="annotation-foot">
                      {annotation.rubric && <span><BookMarked size={11} /> {annotation.rubric}</span>}
                      {annotation.w === 0 && <span>未定位到具体位置</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="report-section scoring-section">
        <div className="section-heading">
          <div><span className="section-no">03</span><h2>{result.paperMode ? '分题评分与依据' : '分项评分'}</h2></div>
          <span className="section-en">{result.paperMode ? 'PER-QUESTION BREAKDOWN' : 'SCORE BREAKDOWN'}</span>
        </div>
        <div className="criteria-table">
          <div className="criteria-row criteria-head">
            <span>评分项</span><span>得分</span><span>满分</span><span>评分依据</span>
          </div>
          {result.criteria.map((criterion) => {
            const itemRatio = criterion.max > 0 ? criterion.awarded / criterion.max : 0;
            return (
              <div className="criteria-row" key={criterion.name}>
                <span className="criteria-name">
                  <i className={`status-dot status-${criterion.status || (itemRatio >= 1 ? 'full' : itemRatio > 0 ? 'partial' : 'miss')}`} />
                  {criterion.name}
                </span>
                <span className="criteria-awarded">{criterion.awarded}</span>
                <span className="criteria-max">{criterion.max}</span>
                <span className="criteria-reason">{criterion.evidence || criterion.reason}</span>
              </div>
            );
          })}
          <div className="criteria-row criteria-total">
            <span>合计</span><span>{result.score}</span><span>{result.maxScore}</span><span>各项得分之和</span>
          </div>
        </div>
      </section>

      {result.generatedRubric?.studentRoute ? (
        <section className="report-section reference-section">
          <div className="section-heading">
            <div><span className="section-no">04</span><h2>学生路线评分依据</h2></div>
            <span className="section-en">STUDENT ROUTE</span>
          </div>
          <p className="section-intro">评分标准按学生解答的实际思路制定，不另做参考解。只有学生路线上数学成立的步骤才进入评分点；错误步骤不因为“思路接近”给分。</p>
          <details className="reference-details" open>
            <summary>
              <span><BookOpen size={16} /> 查看学生路线、成立步骤与评分点映射</span>
              <small>点击收起</small>
            </summary>
            <div className="reference-body">
              <div className="student-route-note">
                <strong>路线状态：{{ valid: '成立', partial: '部分成立', invalid: '未成立' }[result.generatedRubric.studentRoute.status] || result.generatedRubric.studentRoute.status || '部分成立'}</strong>
                <p>{result.generatedRubric.studentRoute.summary}</p>
                {result.generatedRubric.studentRoute.scoringNote ? <small>给分说明：{result.generatedRubric.studentRoute.scoringNote}</small> : null}
              </div>
              {result.generatedRubric.studentRoute.routeSolution ? (
                <div className="reference-part">
                  <h3>按学生思路重述</h3>
                  <MathText>{result.generatedRubric.studentRoute.routeSolution}</MathText>
                </div>
              ) : null}
              {result.generatedRubric.studentRoute.acceptedSteps?.length ? (
                <div className="reference-bridges">
                  {result.generatedRubric.studentRoute.acceptedSteps.map((step) => <span key={step}>{step}</span>)}
                </div>
              ) : null}
              {result.generatedRubric.studentRoute.criterionMap?.length ? (
                <div className="route-map">
                  <h3>评分点映射</h3>
                  {result.generatedRubric.studentRoute.criterionMap.map((item) => (
                    <div className="route-map-row" key={item.criterion}>
                      <strong>{item.criterion}</strong>
                      <span className={`route-credit is-${item.credit}`}>{item.credit}</span>
                      <p>{item.studentEvidence}{item.note ? ` · ${item.note}` : ''}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </details>
        </section>
      ) : null}

      <section className="report-section insight-section">
        <div className="section-heading">
          <div><span className="section-no">05</span><h2>下一步怎么练</h2></div>
          <span className="section-en">NEXT STEPS</span>
        </div>
        <div className="insight-grid">
          <div className="insight-card is-good">
            <h3><CheckCircle2 size={17} /> 做得好的地方</h3>
            <ul>{result.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul>
          </div>
          <div className="insight-card is-fix">
            <h3><Target size={17} /> 优先改进</h3>
            <ul>{result.improvements.map((item, index) => <li key={index}>{item}</li>)}</ul>
          </div>
          <div className="insight-card is-next">
            <h3><Sparkles size={17} /> 建议练习</h3>
            <ul>{result.nextSteps.map((item, index) => <li key={index}>{item}</li>)}</ul>
          </div>
        </div>
      </section>

      <section className="report-section basis-section">
        <div className="section-heading">
          <div><span className="section-no">06</span><h2>评分依据</h2></div>
          <span className="section-en">RUBRIC & SOURCE</span>
        </div>
        <div className="basis-grid">
          <div className="basis-card">
            <h3>使用标准：{result.rubricName}</h3>
            {result.generatedRubric && (
              <div className="generated-rubric-card">
                <FileText size={18} />
                <div>
                  <strong>本题评分标准 · 评分前生成</strong>
                  <p>{result.generatedRubric.categoryLabel} · 满分 {result.generatedRubric.total} 分 · {result.generatedRubric.unit} 分/点</p>
                </div>
                {result.rubricPdfUrl && (
                  <a className="ghost-button" href={result.rubricPdfUrl} download>下载评分标准 PDF</a>
                )}
              </div>
            )}
            {result.rubricText ? <MathText>{result.rubricText}</MathText> : <p className="muted-copy">未上传额外答案或评分细则，系统已按题型与总分生成评分标准。</p>}
          </div>
          <div className="basis-card basis-meta">
            <h3>报告信息</h3>
            <dl>
              <div><dt>报告编号</dt><dd>{result.id}</dd></div>
              <div><dt>生成时间</dt><dd>{formatDate(result.createdAt)}</dd></div>
              <div><dt>模型</dt><dd>{result.providerName} / {result.model}</dd></div>
              <div><dt>置信度</dt><dd>{Math.round(result.confidence * 100)}%</dd></div>
              <div><dt>批注数量</dt><dd>{result.annotations.length} 处</dd></div>
              {result.usage?.inputTokens ? <div><dt>Token 用量</dt><dd>{result.usage.inputTokens} in / {result.usage.outputTokens || 0} out</dd></div> : null}
            </dl>
            <p className="disclaimer">本报告由 AI 辅助生成，仅用于教学反馈，不构成正式竞赛成绩。若手写识别有歧义，请以原卷和教师复核为准。</p>
          </div>
        </div>
      </section>

      <div className="report-end">
        <span>墨析 · 让每一处推导都有回应</span>
        <div>
          <button className="ghost-button" onClick={onBack}><ArrowLeft size={15} /> 返回</button>
          <button className="download-button" onClick={downloadPdf} disabled={pdfBusy}>
            {pdfBusy ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />} 下载 PDF
          </button>
        </div>
      </div>
    </div>
  );
}
