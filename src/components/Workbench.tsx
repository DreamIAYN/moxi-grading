import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BrainCircuit,
  Check,
  ChevronDown,
  CircleAlert,
  FlaskConical,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  ScanLine,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react';
import {
  FALLBACK_PROVIDERS,
  STRICTNESS_LABELS,
  CATEGORY_OPTIONS,
  categoryLabel,
  fileToUploadImage,
  getScoreScheme,
  getAllRubrics,
  loadDefaultRubricId,
} from '../lib';
import type { AppConfig, GradingResult, ProblemCategory, ProviderId, StoredSettings, UploadImage } from '../types';
import Uploader from './Uploader';

const SAMPLE_PROBLEM = '已知 x, y 为正实数，且 x + y = 1，求 (x + 1/x)(y + 1/y) 的最小值。';
const SAMPLE_RUBRIC = '满分 12 分。\n评分要点：\n1. 展开与代换（4 分）：正确化为关于 t=xy 的表达式；\n2. 变量范围（3 分）：说明 0<t≤1/4 及其依据；\n3. 最值论证（4 分）：判断单调性并求出最小值；\n4. 取等条件（1 分）：验证 x=y=1/2 时等号成立。';

const STAGES = [
  { key: 'prepare', label: '预处理手写稿', detail: '校正方向与压缩' },
  { key: 'rubric', label: '制定评分标准', detail: '拆解得分点与允许档位' },
  { key: 'rubric-pdf', label: '生成评分标准 PDF', detail: '评分前先落盘归档' },
  { key: 'read', label: '识读推导步骤', detail: '逐页还原笔迹与公式' },
  { key: 'solve', label: '重建学生路线', detail: '按学生写法梳理关键步骤' },
  { key: 'grade', label: '对照评分标准', detail: '拆分评分点，核对分值' },
  { key: 'annotate', label: '定位逐处批注', detail: '在原图上标出得失分位置' },
  { key: 'report', label: '撰写总评', detail: '整理亮点与下一步建议' },
];

function waitFor(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

interface WorkbenchProps {
  config: AppConfig | null;
  settings: StoredSettings;
  onSettingsChange: (settings: StoredSettings) => void;
  onResult: (result: GradingResult) => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'error') => void;
  onNavigateRubrics: () => void;
  onNavigateSettings: () => void;
}

export default function Workbench({
  config,
  settings,
  onSettingsChange,
  onResult,
  onToast,
  onNavigateRubrics,
  onNavigateSettings,
}: WorkbenchProps) {
  const providers = config?.providers || FALLBACK_PROVIDERS;
  const rubrics = getAllRubrics();
  const [problemText, setProblemText] = useState('');
  const [problemImages, setProblemImages] = useState<UploadImage[]>([]);
  const [solutionImages, setSolutionImages] = useState<UploadImage[]>([]);
  const [rubricText, setRubricText] = useState('');
  const [rubricImages, setRubricImages] = useState<UploadImage[]>([]);
  const [rubricOpen, setRubricOpen] = useState(false);
  const [rubricId, setRubricId] = useState(() => {
    const saved = loadDefaultRubricId();
    return rubrics.some((rubric) => rubric.id === saved) ? saved : 'auto';
  });
  const [maxScore, setMaxScore] = useState(() => {
    const defaultRubric = rubrics.find((rubric) => rubric.id === loadDefaultRubricId());
    return defaultRubric?.total || 12;
  });
  const [category, setCategory] = useState<ProblemCategory>(() => {
    const defaultRubric = rubrics.find((rubric) => rubric.id === loadDefaultRubricId());
    return defaultRubric?.category || 'auto';
  });
  const [paperMode, setPaperMode] = useState<boolean>(() => {
    const defaultRubric = rubrics.find((rubric) => rubric.id === loadDefaultRubricId());
    return defaultRubric?.mode === 'paper';
  });
  const [scoreUnit, setScoreUnit] = useState<number>(() => {
    const defaultRubric = rubrics.find((rubric) => rubric.id === loadDefaultRubricId());
    if (defaultRubric?.unit) return defaultRubric.unit;
    return defaultRubric?.mode === 'paper' ? 1 : 1;
  });
  const [studentName, setStudentName] = useState(settings.studentName || '');
  const [sourceLabel, setSourceLabel] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customModel, setCustomModel] = useState(settings.customModel || '');
  const [grading, setGrading] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(6);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  function fail(message: string) {
    setError(message);
    onToast(message, 'error');
  }

  const provider = providers.find((item) => item.id === settings.providerId) || providers[0];
  const selectedRubric = rubrics.find((rubric) => rubric.id === rubricId) || rubrics[0];
  const selectedModel = provider.models.find((model) => model.id === settings.model);
  const apiKey = settings.apiKeys[provider.id] || '';
  const effectiveModel = customModel.trim() || settings.model;
  const textOnlyWarning = Boolean(selectedModel && !selectedModel.vision && solutionImages.length > 0);

  useEffect(() => {
    const current = provider.models.some((model) => model.id === settings.model);
    if (!current && provider.models.length) {
      onSettingsChange({ ...settings, model: provider.models[0].id });
    }
  }, [provider.id]);

  useEffect(() => {
    onSettingsChange({ ...settings, studentName });
  }, [studentName]);

  useEffect(() => {
    if (!grading) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000);
      setElapsed(seconds);
      setStageIndex(Math.min(STAGES.length - 2, Math.floor(seconds / 8)));
      setProgress((value) => Math.min(91, value + (value < 55 ? 4 : 1.3)));
    }, 900);
    return () => window.clearInterval(timer);
  }, [grading]);

  function selectProvider(id: ProviderId) {
    const next = providers.find((item) => item.id === id);
    if (!next) return;
    onSettingsChange({ ...settings, providerId: id, model: next.models[0]?.id || '' });
    setCustomModel('');
  }

  function chooseRubric(id: string) {
    setRubricId(id);
    const template = rubrics.find((rubric) => rubric.id === id);
    if (!template) return;
    setMaxScore(template.total);
    setCategory(template.category || 'auto');
    setPaperMode(template.mode === 'paper');
    setScoreUnit(template.unit || (template.mode === 'paper' ? 1 : 1));
  }

  function changeCategory(next: ProblemCategory) {
    setCategory(next);
    if (next === 'cmo' && !paperMode) {
      setMaxScore(21);
      setScoreUnit(3);
    }
  }

  function changeMaxScore(value: number) {
    const next = category === 'cmo' ? 21 : Number(value) || 0;
    setMaxScore(next);
    setScoreUnit(category === 'cmo' ? 3 : getScoreScheme(next, undefined, paperMode).unit);
  }

  async function loadSample() {
    try {
      onToast('正在载入示例…', 'info');
      const response = await fetch('/samples/sample-solution.jpg');
      if (!response.ok) throw new Error('示例图片不存在');
      const blob = await response.blob();
      const file = new File([blob], 'sample-solution.jpg', { type: 'image/jpeg' });
      const image = await fileToUploadImage(file);
      setProblemText(SAMPLE_PROBLEM);
      setRubricText(SAMPLE_RUBRIC);
      setSolutionImages([image]);
      setProblemImages([]);
      setRubricImages([]);
      setStudentName('示例同学');
      setSourceLabel('示例 · 代数最值');
      chooseRubric('auto');
      setCategory('algebra');
      setPaperMode(false);
      setScoreUnit(1);
      setMaxScore(12);
      setError('');
      onToast('示例题目与手写解答已载入，可直接开始批改。', 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : '示例载入失败', 'error');
    }
  }

  async function startGrading() {
    setError('');
    if (!problemText.trim() && problemImages.length === 0) {
      fail('请先填写题目文字，或上传一张题目图片。');
      return;
    }
    if (solutionImages.length === 0) {
      fail('请至少上传一页手写解答照片。');
      return;
    }
    if (provider.id !== 'demo' && !apiKey && !provider.serverKeyConfigured) {
      fail(`尚未配置 ${provider.name} 的 API Key。请前往「接入设置」填写，或切换到演示模式。`);
      return;
    }
    if (textOnlyWarning) {
      fail(`当前模型 ${effectiveModel} 不支持图像输入，请改用视觉模型，或切换到演示模式。`);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setGrading(true);
    setStageIndex(0);
    setProgress(6);
    setElapsed(0);
    try {
      const { startGrade, fetchTask } = await import('../api');
      const { taskId } = await startGrade(
        {
          problemText,
          problemImages,
          solutionImages,
          rubricText,
          rubricImages,
          rubricName: selectedRubric.name,
          rubricItems: selectedRubric.items,
          rubricQuestions: selectedRubric.questions,
          rubricTemplate: selectedRubric,
          maxScore,
          category,
          scoreUnit,
          paperMode,
          providerId: provider.id,
          model: effectiveModel,
          apiKey: apiKey || undefined,
          baseUrl: settings.baseUrls[provider.id] || undefined,
          strictness: settings.strictness,
          studentName,
          sourceLabel,
        },
        controller.signal,
      );
      let response: { job: GradingResult; warnings?: string[] } | undefined;
      let delay = 700;
      while (!response) {
        await waitFor(delay, controller.signal);
        delay = 2500;
        const task = await fetchTask(taskId);
        if (task.status === 'done') {
          if (!task.result) throw new Error('后台任务已完成，但没有返回结果。');
          response = task.result;
          break;
        }
        if (task.status === 'error') throw new Error(task.error || '后台批改失败，请稍后重试。');
        setProgress((value) => Math.min(93, value + 1.5));
      }
      setProgress(100);
      setStageIndex(STAGES.length - 1);
      if (response.warnings?.length) onToast(response.warnings[0], 'info');
      window.setTimeout(() => {
        setGrading(false);
        onResult(response.job);
      }, 650);
    } catch (err) {
      setGrading(false);
      if ((err as Error).name === 'AbortError') {
        fail('已停止等待；后台批改会继续，完成后可在历史报告中查看。');
      } else {
        fail(err instanceof Error ? err.message : '批改失败，请稍后重试。');
      }
    } finally {
      abortRef.current = null;
    }
  }

  function cancelGrading() {
    abortRef.current?.abort();
    setGrading(false);
    fail('批改已取消。');
  }

  const paperReady = !paperMode || Boolean(selectedRubric.questions?.length);
  const canSubmit = Boolean((problemText.trim() || problemImages.length) && solutionImages.length && maxScore >= 1 && paperReady);
  const scheme = getScoreScheme(maxScore, scoreUnit, paperMode);
  const hasProvidedRubric = Boolean(rubricText.trim() || rubricImages.length);
  const pdfAvailable = config?.pdfAvailable !== false;

  return (
    <div className="workbench">
      <section className="hero">
        <div className="hero-main">
          <div className="eyebrow"><span className="eyebrow-line" />AI-ASSISTED OLYMPIAD GRADING</div>
          <h1>
            把每一笔推导，
            <br />
            <em>改得明明白白。</em>
          </h1>
          <p>
            上传题目与手写解答，AI 阅卷人先按学生思路重建解题路线，再按评分标准逐处批注。
            得分、错因、补写建议与原卷标注，一并归档为 PDF。
          </p>
          <div className="hero-actions">
            <a className="primary-cta" href="#problem">
              开始批改
              <ArrowRight size={16} />
            </a>
            <button className="ghost-cta" onClick={loadSample}>
              <FlaskConical size={16} />
              载入一份示例
            </button>
          </div>
          <div className="hero-meta">
            <span><Check size={14} /> 三家模型接口</span>
            <span><Check size={14} /> 原图逐处批注</span>
            <span><Check size={14} /> PDF 报告归档</span>
          </div>
        </div>
        <div className="hero-side">
          <div className="seal-card">
            <div className="seal">
              <span>数竞</span>
              <span>批改</span>
              <small>墨析</small>
            </div>
            <div className="seal-note">
              <span className="seal-rule" />
              <p>以严谨为尺度<br />以启发为目的</p>
              <small>先解题 · 再评分 · 后批注</small>
            </div>
          </div>
          <div className="hero-stat">
            <strong>01</strong>
            <span>题目与手写稿</span>
            <strong>02</strong>
            <span>评分与逐处批注</span>
            <strong>03</strong>
            <span>可打印 PDF</span>
          </div>
        </div>
      </section>

      <div className="workbench-grid">
        <div className="workbench-main">
          <section className="step-card" id="problem">
            <header className="step-head">
              <span className="step-no">01</span>
              <div className="step-title">
                <h2>题目</h2>
                <p>粘贴题面，或上传试卷 / 题目截图。文字与图片可以同时使用。</p>
              </div>
              <span className="step-tag is-required">必填</span>
            </header>
            <div className="step-body">
              <div className="paper-input-wrap">
                <textarea
                  className="paper-input"
                  value={problemText}
                  onChange={(event) => setProblemText(event.target.value)}
                  placeholder="例：已知 x, y 为正实数，且 x + y = 1，求 (x + 1/x)(y + 1/y) 的最小值。&#10;&#10;支持 LaTeX，如 $x^2+y^2$。"
                  rows={5}
                />
                <span className="paper-input-hint">支持 LaTeX 公式</span>
              </div>
              <div className="field-divider"><span>题目图片 / PDF（可选，最多 8 页）</span></div>
              <Uploader
                images={problemImages}
                onChange={setProblemImages}
                max={8}
                emptyTitle="上传题目 / 试卷"
                emptyHint="拖入试卷照片，或点击选择文件"
                pageLabel={false}
                compact
                onError={(message) => onToast(message, 'error')}
                onNotice={(message) => onToast(message, 'success')}
              />
            </div>
          </section>

          <section className="step-card" id="solution">
            <header className="step-head">
              <span className="step-no">02</span>
              <div className="step-title">
                <h2>手写解答</h2>
                <p>按作答顺序上传全部页面。支持旋转、调整页序，上传后会自动压缩。</p>
              </div>
              <span className="step-tag is-required">必填</span>
            </header>
            <div className="step-body">
              <Uploader
                images={solutionImages}
                onChange={setSolutionImages}
                max={12}
                emptyTitle="把解答照片或 PDF 放在这里"
                emptyHint="可一次选择多页；建议光线均匀、纸张铺平"
                onError={(message) => onToast(message, 'error')}
                onNotice={(message) => onToast(message, 'success')}
              />
              <div className="inline-fields">
                <label className="field">
                  <span>学生姓名 <small>选填，写入报告</small></span>
                  <input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="未署名同学" />
                </label>
                <label className="field">
                  <span>来源 / 考试 <small>选填</small></span>
                  <input value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} placeholder="例：2025 高联二试 · 第 2 题" />
                </label>
              </div>
            </div>
          </section>

          <section className={`step-card rubric-card ${rubricOpen ? 'is-open' : ''}`}>
            <button className="step-head as-button" onClick={() => setRubricOpen((open) => !open)} aria-expanded={rubricOpen}>
              <span className="step-no">03</span>
              <div className="step-title">
                <h2>答案与评分标准</h2>
                <p>可选。上传官方答案、评分细则，或直接选择下方的评分模板。</p>
              </div>
              <span className="step-tag">选填</span>
              <ChevronDown className={`step-chevron ${rubricOpen ? 'is-open' : ''}`} size={18} />
            </button>
            {rubricOpen && (
              <div className="step-body rubric-body">
                <div className="rubric-selector-row">
                  <label className="field">
                    <span>本题评分标准</span>
                    <select value={rubricId} onChange={(event) => chooseRubric(event.target.value)}>
                      {rubrics.map((rubric) => (
                        <option key={rubric.id} value={rubric.id}>{rubric.name} · 满分 {rubric.total}</option>
                      ))}
                    </select>
                  </label>
                  <button className="text-button" onClick={onNavigateRubrics}>管理评分标准 <ArrowRight size={14} /></button>
                </div>
                {selectedRubric.items.length > 0 && (
                  <div className="rubric-mini-list">
                    {selectedRubric.items.map((item) => (
                      <span key={item.name}>{item.name}<b>{item.max}</b></span>
                    ))}
                  </div>
                )}
                <div className="paper-input-wrap">
                  <textarea
                    className="paper-input paper-input-small"
                    value={rubricText}
                    onChange={(event) => setRubricText(event.target.value)}
                    placeholder="粘贴官方答案、评分细则或阅卷备注。AI 会优先遵循这里的分步给分要求。"
                    rows={4}
                  />
                </div>
                <div className="field-divider"><span>评分标准图片 / PDF（可选，最多 12 页）</span></div>
                <Uploader
                  images={rubricImages}
                  onChange={setRubricImages}
                  max={12}
                  emptyTitle="上传答案 / 评分细则"
                  emptyHint="支持扫描件或截图"
                  pageLabel={false}
                  compact
                  onError={(message) => onToast(message, 'error')}
                  onNotice={(message) => onToast(message, 'success')}
                />
              </div>
            )}
          </section>

          {error && (
            <div className="error-banner" role="alert">
              <CircleAlert size={18} />
              <div>
                <strong>还差一步</strong>
                <p>{error}</p>
              </div>
              <button onClick={() => setError('')} aria-label="关闭"><X size={15} /></button>
            </div>
          )}
        </div>

        <aside className="config-column">
          <div className="config-card">
            <div className="config-head">
              <div>
                <span className="eyebrow">GRADING SETUP</span>
                <h3>批改配置</h3>
              </div>
              <span className={`engine-state ${provider.id === 'demo' ? 'is-demo' : apiKey || provider.serverKeyConfigured ? 'is-ready' : ''}`}>
                <span />
                {provider.id === 'demo' ? '演示' : apiKey || provider.serverKeyConfigured ? '已就绪' : '待配置'}
              </span>
            </div>

            <div className="config-section">
              <div className="config-label">模型服务商</div>
              <div className="provider-grid">
                {providers.map((item) => {
                  const ready = item.id === 'demo' || item.serverKeyConfigured || Boolean(settings.apiKeys[item.id]);
                  return (
                    <button
                      key={item.id}
                      className={`provider-tile ${provider.id === item.id ? 'is-active' : ''}`}
                      onClick={() => selectProvider(item.id)}
                    >
                      <span className="provider-mark" style={{ color: item.accent }}>{item.short}</span>
                      <span className="provider-name">{item.name}</span>
                      <span className={`provider-ready ${ready ? 'is-ready' : ''}`}>{item.id === 'demo' ? '本地' : ready ? '就绪' : '待配置'}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {provider.id !== 'demo' ? (
              <>
                <div className="config-section">
                  <div className="config-label-row">
                    <span className="config-label">模型</span>
                    <span className="vision-badge">{selectedModel?.vision ? '支持图像' : '纯文本'}</span>
                  </div>
                  <select
                    className="config-select"
                    value={settings.model}
                    onChange={(event) => onSettingsChange({ ...settings, model: event.target.value, customModel: '' })}
                  >
                    {provider.models.map((model) => (
                      <option key={model.id} value={model.id}>{model.label}</option>
                    ))}
                  </select>
                  {selectedModel?.note && <p className="field-note">{selectedModel.note}</p>}
                </div>

                <div className="config-section">
                  <div className="config-label-row">
                    <span className="config-label">API Key</span>
                    {provider.serverKeyConfigured && <span className="server-key-badge"><ShieldCheck size={12} /> 服务端已配置</span>}
                  </div>
                  <div className="key-input-wrap">
                    <KeyRound size={15} />
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(event) => onSettingsChange({
                        ...settings,
                        apiKeys: { ...settings.apiKeys, [provider.id]: event.target.value },
                      })}
                      placeholder={provider.serverKeyConfigured ? '留空则使用服务端密钥' : '粘贴 API Key'}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button onClick={() => setShowKey((value) => !value)} type="button">{showKey ? '隐藏' : '显示'}</button>
                  </div>
                  <p className="field-note"><LockKeyhole size={11} /> 密钥仅保存在本机浏览器，不写入报告。</p>
                </div>
              </>
            ) : (
              <div className="demo-note">
                <span><BrainCircuit size={17} /></span>
                <p><strong>无需密钥，先看完整流程。</strong>演示报告使用内置示例批注，不会调用外部模型。接入真实模型请前往「接入设置」。</p>
              </div>
            )}

            <div className="config-section">
              <div className="config-label-row">
                <span className="config-label">题型与评分单位</span>
                <span className="vision-badge">{scheme.mode === 'paper' ? '整卷' : scheme.mode === 'all-or-nothing' ? '0/满分' : `${scheme.unit} 分/点`}</span>
              </div>
              <select className="config-select" value={category} onChange={(event) => changeCategory(event.target.value as ProblemCategory)}>
                {CATEGORY_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              <p className="field-note">{scheme.label}{scheme.levels.length ? ` · 可用档位 ${scheme.levels.join(' / ')}` : ' · 按题给分'}</p>
              <label className="paper-toggle">
                <input type="checkbox" checked={paperMode} onChange={(event) => {
                  const checked = event.target.checked;
                  setPaperMode(checked);
                  if (checked && selectedRubric.questions?.length) {
                    setMaxScore(selectedRubric.questions.reduce((sum, question) => sum + question.max, 0));
                    setScoreUnit(1);
                  }
                }} />
                <span>整卷模式（按题逐项给分）</span>
              </label>
              {paperMode && !paperReady && <p className="field-note error-text">当前模板没有题目结构。请选择「2026 A · 一试整卷」等整卷模板，或关闭整卷模式。</p>}
            </div>

            <div className="config-section config-score-row">
              <label className="score-input">
                <span>本题 / 本卷满分</span>
                <div>
                  <input
                    type="number"
                    min={1}
                    max={300}
                    step={0.5}
                    value={maxScore}
                    disabled={category === 'cmo' && !paperMode}
                    onChange={(event) => changeMaxScore(Number(event.target.value) || 0)}
                  />
                  <small>分</small>
                </div>
              </label>
              <div className="strictness">
                <span>批改尺度</span>
                <div className="segmented">
                  {Object.entries(STRICTNESS_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      className={settings.strictness === key ? 'is-active' : ''}
                      onClick={() => onSettingsChange({ ...settings, strictness: key as StoredSettings['strictness'] })}
                    >{label}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="config-section rubric-summary">
              <span className="config-label">评分依据</span>
              <div className="rubric-pill">
                <span>{selectedRubric.name}</span>
                <b>{selectedRubric.questions?.length ? `${selectedRubric.questions.length} 题` : selectedRubric.items.length ? `${selectedRubric.items.length} 项` : 'AI 拆解'}</b>
              </div>
              <button className="text-button" onClick={() => setRubricOpen(true)}>添加官方答案或细则 <ArrowRight size={13} /></button>
              {!hasProvidedRubric && (
                <p className="field-note rubric-generate-note">未提供官方细则：批改前将先自动制定本题评分标准，并生成可下载的 PDF。</p>
              )}
            </div>

            <button className="grade-button" onClick={startGrading} disabled={grading || !canSubmit}>
              {grading ? <LoaderCircle className="spin" size={18} /> : <WandSparkles size={18} />}
              {grading ? '阅卷中…' : '开始批改'}
            </button>
            <p className="grade-note">
              {!pdfAvailable && <><CircleAlert size={12} /> PDF 引擎未就绪，报告暂时只能在线查看。<br /></>}
              通常需要 30–120 秒；可以离开页面，后台会继续完成。图片会发送至所选模型服务商。
            </p>

            <details className="advanced" open={advancedOpen} onToggle={(event) => setAdvancedOpen((event.target as HTMLDetailsElement).open)}>
              <summary>高级选项</summary>
              <label className="field">
                <span>自定义模型名 <small>覆盖上方选择</small></span>
                <input
                  value={customModel}
                  onChange={(event) => {
                    setCustomModel(event.target.value);
                    onSettingsChange({ ...settings, customModel: event.target.value });
                  }}
                  placeholder={settings.model}
                />
              </label>
              <button className="text-button" onClick={onNavigateSettings}>修改接口地址 / 测试连接 <ArrowRight size={13} /></button>
            </details>
          </div>

          <div className="config-aside">
            <ScanLine size={16} />
            <p><strong>批注如何定位？</strong>模型会返回归一化的坐标框，报告将彩色标注直接叠回原手写页；无法定位的批注会保留在文字清单中。</p>
          </div>
        </aside>
      </div>

      {grading && (
        <div className="grading-overlay" role="dialog" aria-modal="true" aria-label="正在批改">
          <div className="grading-card">
            <div className="grading-visual">
              {solutionImages[0] ? (
                <div className="scan-frame">
                  <img src={solutionImages[0].dataUrl} alt="正在识读的手写解答" />
                  <span className="scan-line" />
                  <span className="scan-corner tl" /><span className="scan-corner tr" />
                  <span className="scan-corner bl" /><span className="scan-corner br" />
                </div>
              ) : (
                <div className="scan-placeholder"><ScanLine size={32} /></div>
              )}
              <div className="grading-progress">
                <div style={{ width: `${progress}%` }} />
              </div>
              <div className="grading-meta">
                <span>{provider.name} · {effectiveModel}</span>
                <span>{elapsed}s</span>
              </div>
            </div>
            <div className="grading-info">
              <div className="eyebrow">GRADING IN PROGRESS</div>
              <h3>正在逐页阅卷</h3>
              <p>先按学生解答重建路线并生成评分标准 PDF，再把每一处得分与失分放回原稿位置。可以关闭页面，后台会继续完成。</p>
              <div className="stage-list">
                {STAGES.map((stage, index) => (
                  <div key={stage.key} className={`stage ${index < stageIndex ? 'is-done' : index === stageIndex ? 'is-active' : ''}`}>
                    <span className="stage-dot">{index < stageIndex ? <Check size={11} /> : index + 1}</span>
                    <div><strong>{stage.label}</strong><small>{stage.detail}</small></div>
                    {index === stageIndex && <LoaderCircle className="spin" size={14} />}
                  </div>
                ))}
              </div>
              <div className="grading-actions">
                <span><Sparkles size={13} /> 通常会给出 4–12 条逐点批注</span>
                <button onClick={cancelGrading}>停止等待</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
