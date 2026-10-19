import { useEffect, useState } from 'react';
import { LoaderCircle, MessageSquareWarning, RefreshCw, Send } from 'lucide-react';
import { fetchAppeals, updateAppeal } from '../api';
import type { Appeal, AppealStatus, AuthUser } from '../types';
import { formatDate } from '../lib';
import { ViewHeading } from './Header';

const STATUS_LABELS: Record<AppealStatus, string> = {
  open: '待处理',
  reviewing: '处理中',
  resolved: '已处理',
  rejected: '已驳回',
};

interface AppealsViewProps {
  user: AuthUser;
  onToast: (message: string, tone?: 'info' | 'success' | 'error') => void;
}

export default function AppealsView({ user, onToast }: AppealsViewProps) {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, { status: AppealStatus; response: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setAppeals(await fetchAppeals());
    } catch (error) {
      onToast(error instanceof Error ? error.message : '申诉读取失败', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save(appeal: Appeal) {
    const draft = editing[appeal.id];
    if (!draft) return;
    setSaving(appeal.id);
    try {
      const updated = await updateAppeal(appeal.id, { status: draft.status, adminResponse: draft.response });
      setAppeals((current) => current.map((item) => item.id === updated.id ? updated : item));
      onToast('申诉状态已更新。', 'success');
    } catch (error) {
      onToast(error instanceof Error ? error.message : '申诉更新失败', 'error');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="appeals-view">
      <ViewHeading
        eyebrow="GRADE APPEALS"
        title="分数可以讨论，依据必须留下。"
        description={user.role === 'admin' ? '超级管理员视图：查看并处理所有用户的评分申诉。' : '这里只显示你提交过的申诉；管理员回复后会在这里更新。'}
        icon={<MessageSquareWarning size={14} />}
        actions={<button className="ghost-button" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> 刷新</button>}
      />
      {loading ? (
        <div className="loading-panel"><LoaderCircle className="spin" size={24} /><span>正在读取申诉…</span></div>
      ) : appeals.length === 0 ? (
        <div className="empty-panel"><MessageSquareWarning size={30} /><h3>还没有申诉</h3><p>在批改报告页点击「申诉本次评分」即可提交。</p></div>
      ) : (
        <div className="appeal-list">
          {appeals.map((appeal) => {
            const draft = editing[appeal.id] || { status: appeal.status, response: appeal.adminResponse || '' };
            return (
              <article className={`appeal-card is-${appeal.status}`} key={appeal.id}>
                <header>
                  <div>
                    <span className="appeal-status">{STATUS_LABELS[appeal.status]}</span>
                    <strong>报告 #{appeal.jobId.slice(-8).toUpperCase()}</strong>
                    {user.role === 'admin' && <small>用户：{appeal.username}</small>}
                  </div>
                  <time>{formatDate(appeal.createdAt)}</time>
                </header>
                <p className="appeal-message">{appeal.message}</p>
                {appeal.contact && <p className="appeal-contact">联系方式：{appeal.contact}</p>}
                {appeal.adminResponse && <div className="appeal-response"><strong>管理员回复</strong><p>{appeal.adminResponse}</p></div>}
                {user.role === 'admin' && (
                  <div className="appeal-admin">
                    <select value={draft.status} onChange={(event) => setEditing({ ...editing, [appeal.id]: { ...draft, status: event.target.value as AppealStatus } })}>
                      {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <textarea value={draft.response} onChange={(event) => setEditing({ ...editing, [appeal.id]: { ...draft, response: event.target.value } })} placeholder="写下处理结论或回复…" rows={3} />
                    <button className="primary-cta small" onClick={() => save(appeal)} disabled={saving === appeal.id}>
                      {saving === appeal.id ? <LoaderCircle className="spin" size={14} /> : <Send size={14} />} 更新申诉
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
