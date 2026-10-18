import { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  GripVertical,
  LibraryBig,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  getAllRubrics,
  loadDefaultRubricId,
  newId,
  CATEGORY_OPTIONS,
  categoryLabel,
  saveCustomRubrics,
  saveDefaultRubricId,
} from '../lib';
import type { RubricTemplate } from '../types';
import { ViewHeading } from './Header';

interface RubricLibraryProps {
  onToast: (message: string, tone?: 'info' | 'success' | 'error') => void;
}

function emptyRubric(): RubricTemplate {
  return {
    id: newId('custom-'),
    name: '新的评分标准',
    scope: '自定义 · 单题',
    total: 12,
    description: '说明这套标准的适用场景与给分原则。',
    items: [
      { name: '思路与入口', max: 4, description: '是否正确抓住题目结构。' },
      { name: '关键步骤', max: 5, description: '核心引理、构造或推导是否完成。' },
      { name: '严谨与书写', max: 3, description: '边界、等号条件与表述。' },
    ],
    category: 'other',
    unit: 1,
    mode: 'standard',
    builtin: false,
  };
}

export default function RubricLibrary({ onToast }: RubricLibraryProps) {
  const [rubrics, setRubrics] = useState<RubricTemplate[]>(() => getAllRubrics());
  const [defaultId, setDefaultId] = useState(() => loadDefaultRubricId());
  const [editing, setEditing] = useState<RubricTemplate | null>(null);
  const customIds = useMemo(() => new Set(rubrics.filter((r) => !r.builtin).map((r) => r.id)), [rubrics]);

  function persist(next: RubricTemplate[]) {
    setRubrics(next);
    saveCustomRubrics(next);
  }

  function setDefault(id: string) {
    setDefaultId(id);
    saveDefaultRubricId(id);
    const target = rubrics.find((rubric) => rubric.id === id);
    onToast(`已将「${target?.name || '评分标准'}」设为默认。`, 'success');
  }

  function duplicate(source: RubricTemplate) {
    const copy: RubricTemplate = {
      ...source,
      id: newId('custom-'),
      name: `${source.name}（副本）`,
      builtin: false,
      official: false,
    };
    setEditing(copy);
  }

  function remove(template: RubricTemplate) {
    if (!window.confirm(`确定删除「${template.name}」？`)) return;
    const next = rubrics.filter((rubric) => rubric.id !== template.id);
    persist(next);
    if (defaultId === template.id) {
      saveDefaultRubricId('auto');
      setDefaultId('auto');
    }
    onToast('评分标准已删除。', 'info');
  }

  function saveEditor(template: RubricTemplate) {
    if (!template.name.trim()) {
      onToast('请填写评分标准名称。', 'error');
      return;
    }
    if (!template.items.length || template.items.some((item) => !item.name.trim() || !(item.max > 0))) {
      onToast('每个评分项都需要名称和大于 0 的满分。', 'error');
      return;
    }
    const total = template.items.reduce((sum, item) => sum + Number(item.max || 0), 0);
    const normalized = { ...template, total, builtin: false, official: false };
    const exists = rubrics.some((rubric) => rubric.id === template.id);
    const next = exists
      ? rubrics.map((rubric) => (rubric.id === template.id ? normalized : rubric))
      : [...rubrics, normalized];
    persist(next);
    setEditing(null);
    onToast('评分标准已保存。', 'success');
  }

  return (
    <div className="library-view">
      <ViewHeading
        eyebrow="RUBRIC LIBRARY"
        title="把阅卷尺度，先定下来。"
        description="内置高联、CMO、IMO 的常用分项标准，也可以建立自己的总体评分标准。批改时选择模板，AI 会严格沿用其中的评分项与满分。"
        icon={<LibraryBig size={14} />}
        actions={<button className="primary-cta small" onClick={() => setEditing(emptyRubric())}><Plus size={15} /> 新建标准</button>}
      />

      <div className="library-note">
        <Star size={15} />
        <p>标记为「默认」的标准会自动出现在批改台。自定义标准只保存在本机浏览器，可随时编辑或复制。</p>
      </div>

      <div className="official-refs">
        <div>
          <span className="official-refs-label">2026 高联 A 卷 · 官方文件</span>
          <p>试题与参考答案已随项目归档；评分标准中的 40/50/21/7 分档、10/3/1 分得分点与一试结构已写入上方模板。</p>
        </div>
        <div className="official-ref-links">
          <a href="/docs/references/2026-a-first-exam-questions.pdf" target="_blank" rel="noreferrer">一试试题</a>
          <a href="/docs/references/2026-a-first-exam-solutions.pdf" target="_blank" rel="noreferrer">一试答案与评分</a>
          <a href="/docs/references/2026-a-extra-questions.pdf" target="_blank" rel="noreferrer">加试试题</a>
          <a href="/docs/references/2026-a-extra-solutions.pdf" target="_blank" rel="noreferrer">加试答案与评分</a>
          <a href="/docs/references/2026-a-scoring-notes.pdf" target="_blank" rel="noreferrer">评分标准说明</a>
        </div>
      </div>

      <div className="rubric-library-grid">
        {rubrics.map((template) => (
          <article className={`rubric-template ${defaultId === template.id ? 'is-default' : ''}`} key={template.id}>
            <header>
              <div className="rubric-template-title">
                <div className="rubric-badges">
                  <span className="rubric-badge">{template.official ? '官方' : template.builtin ? '内置' : '自定义'}</span>
                  {template.category && <span className="rubric-badge">{categoryLabel(template.category)}</span>}
                  {template.mode === 'paper' && <span className="rubric-badge">整卷</span>}
                </div>
                <h3>{template.name}</h3>
                <p>{template.scope}{template.mode === 'paper' ? ' · 整卷' : template.unit ? ` · ${template.unit} 分/点` : ''}</p>
              </div>
              <div className="rubric-total">
                <strong>{template.questions?.length || template.total}</strong><span>{template.questions?.length ? '题' : '分'}</span>
              </div>
            </header>
            <p className="rubric-desc">{template.description}</p>
            <div className="rubric-items">
              {template.items.length ? template.items.map((item, index) => (
                <div className="rubric-item" key={`${item.name}-${index}`}>
                  <span className="rubric-item-name">{item.name}</span>
                  <span className="rubric-item-bar"><i style={{ width: `${Math.min(100, (item.max / Math.max(1, template.total)) * 100 * 2)}%` }} /></span>
                  <b>{item.max}</b>
                </div>
              )) : (
                <div className="rubric-auto-note">不预设分项，由 AI 根据题目结构拆解 3–5 个评分点。</div>
              )}
            </div>
            <footer>
              <button
                className={`text-button ${defaultId === template.id ? 'is-default' : ''}`}
                onClick={() => setDefault(template.id)}
                disabled={defaultId === template.id}
              >
                {defaultId === template.id ? <><Check size={13} /> 默认标准</> : <><Star size={13} /> 设为默认</>}
              </button>
              <div>
                <button className="icon-text-button" onClick={() => duplicate(template)}><Copy size={13} /> 复制</button>
                {customIds.has(template.id) && (
                  <>
                    <button className="icon-text-button" onClick={() => setEditing(template)}><Pencil size={13} /> 编辑</button>
                    <button className="icon-text-button danger" onClick={() => remove(template)}><Trash2 size={13} /></button>
                  </>
                )}
                {template.builtin && template.id !== 'auto' && (
                  <button className="icon-text-button" onClick={() => setEditing({ ...template, id: newId('custom-'), name: `${template.name}（自定义）`, builtin: false, official: false })}><Pencil size={13} /> 基于此编辑</button>
                )}
              </div>
            </footer>
          </article>
        ))}
      </div>

      {editing && (
        <RubricEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={saveEditor}
        />
      )}
    </div>
  );
}

function RubricEditor({ initial, onClose, onSave }: {
  initial: RubricTemplate;
  onClose: () => void;
  onSave: (template: RubricTemplate) => void;
}) {
  const [draft, setDraft] = useState<RubricTemplate>(() => ({
    ...initial,
    items: initial.items.length ? initial.items.map((item) => ({ ...item })) : [{ name: '', max: 4, description: '' }],
  }));
  const total = draft.items.reduce((sum, item) => sum + (Number(item.max) || 0), 0);

  function updateItem(index: number, patch: Partial<RubricTemplate['items'][number]>) {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="编辑评分标准">
      <div className="rubric-editor">
        <header>
          <div>
            <div className="eyebrow">RUBRIC EDITOR</div>
            <h2>{initial.name ? '编辑评分标准' : '新建评分标准'}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>
        <div className="editor-body">
          <div className="editor-fields">
            <label className="field"><span>名称</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label className="field"><span>适用范围</span><input value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value })} /></label>
            <label className="field"><span>题型</span><select value={draft.category || 'other'} onChange={(event) => setDraft({ ...draft, category: event.target.value as typeof draft.category })}>{CATEGORY_OPTIONS.filter((option) => option.id !== 'auto').map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
            <label className="field"><span>得分点单位</span><input type="number" min={0.5} step={0.5} value={draft.unit || 1} onChange={(event) => setDraft({ ...draft, unit: Number(event.target.value) || 1 })} /></label>
            <label className="field"><span>给分方式</span><select value={draft.mode || 'standard'} onChange={(event) => setDraft({ ...draft, mode: event.target.value as typeof draft.mode })}><option value="standard">普通分档</option><option value="all-or-nothing">全对全错（如填空）</option><option value="paper">整卷（按题）</option></select></label>
            <label className="field field-wide"><span>说明</span><textarea rows={2} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          </div>
          <div className="editor-items-head">
            <div><strong>评分项</strong><span>满分合计 <b>{total}</b> 分</span></div>
            <button className="text-button" onClick={() => setDraft({ ...draft, items: [...draft.items, { name: '', max: 3, description: '' }] })}><Plus size={13} /> 添加评分项</button>
          </div>
          <div className="editor-items">
            {draft.items.map((item, index) => (
              <div className="editor-item" key={index}>
                <span className="editor-grip"><GripVertical size={14} /></span>
                <div className="editor-item-main">
                  <input
                    className="editor-item-name"
                    value={item.name}
                    placeholder={`评分项 ${index + 1}`}
                    onChange={(event) => updateItem(index, { name: event.target.value })}
                  />
                  <input
                    className="editor-item-desc"
                    value={item.description || ''}
                    placeholder="这一项看什么？"
                    onChange={(event) => updateItem(index, { description: event.target.value })}
                  />
                </div>
                <div className="editor-item-score">
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={item.max}
                    onChange={(event) => updateItem(index, { max: Number(event.target.value) })}
                  />
                  <span>分</span>
                </div>
                <button className="icon-text-button danger" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== index) })}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
        <footer>
          <span>总分将自动按评分项合计为 <b>{total}</b> 分。</span>
          <div>
            <button className="ghost-button" onClick={onClose}>取消</button>
            <button className="primary-cta small" onClick={() => onSave({ ...draft, total })}><Check size={15} /> 保存标准</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
