import { useEffect, useState } from 'react';
import {
  Archive,
  ArrowRight,
  CalendarDays,
  Download,
  FileText,
  LoaderCircle,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { fetchJob, fetchJobs, pdfUrl, removeJob } from '../api';
import type { AuthUser, GradingResult, JobMeta } from '../types';
import { formatDate } from '../lib';
import { ViewHeading } from './Header';

interface HistoryViewProps {
  user: AuthUser;
  onOpen: (result: GradingResult) => void;
  onNew: () => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'error') => void;
}

export default function HistoryView({ user, onOpen, onNew, onToast }: HistoryViewProps) {
  const [jobs, setJobs] = useState<JobMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setJobs(await fetchJobs());
    } catch (err) {
      setError(err instanceof Error ? err.message : '历史报告读取失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function open(id: string) {
    setOpening(id);
    try {
      onOpen(await fetchJob(id));
    } catch (err) {
      onToast(err instanceof Error ? err.message : '报告打开失败', 'error');
    } finally {
      setOpening(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('确定删除这份报告？图片与 PDF 缓存也会一并删除。')) return;
    try {
      await removeJob(id);
      setJobs((current) => current.filter((job) => job.id !== id));
      onToast('报告已删除。', 'info');
    } catch (err) {
      onToast(err instanceof Error ? err.message : '删除失败', 'error');
    }
  }

  return (
    <div className="history-view">
      <ViewHeading
        eyebrow="REPORT ARCHIVE"
        title="批改过的每一份，都留在这里。"
        description={user.role === 'admin' ? '超级管理员视图：可查看所有用户的历史报告。' : '这里只显示你自己的报告；其他用户无法查看或打开。'}
        icon={<Archive size={14} />}
        actions={<button className="ghost-button" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> 刷新</button>}
      />

      {loading ? (
        <div className="loading-panel"><LoaderCircle className="spin" size={24} /><span>正在读取报告…</span></div>
      ) : error ? (
        <div className="empty-panel">
          <FileText size={28} />
          <h3>报告读取失败</h3>
          <p>{error}</p>
          <button className="primary-cta small" onClick={load}>重新读取</button>
        </div>
      ) : jobs.length === 0 ? (
        <div className="empty-panel">
          <Archive size={30} />
          <h3>还没有批改记录</h3>
          <p>从一份题目与手写稿开始，第一份报告会自动归档在这里。</p>
          <button className="primary-cta small" onClick={onNew}>去批改第一题 <ArrowRight size={15} /></button>
        </div>
      ) : (
        <div className="history-grid">
          {jobs.map((job) => {
            const ratio = job.maxScore > 0 ? job.score / job.maxScore : 0;
            return (
              <article className="history-card" key={job.id}>
                <header>
                  <div className="history-date"><CalendarDays size={13} /> {formatDate(job.createdAt)}</div>
                  <div className={`history-grade ${ratio >= 0.85 ? 'is-high' : ratio >= 0.6 ? 'is-mid' : 'is-low'}`}>
                    <strong>{Number.isInteger(job.score) ? job.score : job.score.toFixed(1)}</strong>
                    <span>/ {job.maxScore}</span>
                  </div>
                </header>
                <h3>{job.problemExcerpt}</h3>
                <p>{job.gradeLabel} · {job.solutionCount} 页解答 · {job.model}</p>
                <div className="history-tags">
                  {job.demo && <span className="mini-tag is-demo">演示</span>}
                  {user.role === 'admin' && job.ownerName && <span className="mini-tag">用户：{job.ownerName}</span>}
                  {job.categoryLabel && <span className="mini-tag">{job.categoryLabel}</span>}
                  {job.paperMode && <span className="mini-tag">整卷</span>}
                  <span className="mini-tag">{job.providerName}</span>
                  <span className="mini-tag">#{job.id.slice(-6).toUpperCase()}</span>
                </div>
                <footer>
                  <button className="text-button" onClick={() => open(job.id)} disabled={opening === job.id}>
                    {opening === job.id ? <LoaderCircle className="spin" size={13} /> : <FileText size={13} />}
                    {opening === job.id ? '打开中…' : '打开报告'}
                  </button>
                  <div>
                    <a className="icon-text-button" href={pdfUrl(job.id)} target="_blank" rel="noreferrer" title="下载 PDF"><Download size={14} /></a>
                    <button className="icon-text-button danger" onClick={() => remove(job.id)} title="删除报告"><Trash2 size={14} /></button>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
