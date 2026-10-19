import type { ReactNode } from 'react';
import { BookOpenCheck, History, LibraryBig, LogOut, Settings2, Sparkles, UserRound } from 'lucide-react';
import type { AuthUser } from '../types';

export type View = 'workbench' | 'result' | 'rubrics' | 'history' | 'appeals' | 'settings';

const NAV: { id: View; label: string; sub: string }[] = [
  { id: 'workbench', label: '批改台', sub: 'WORKBENCH' },
  { id: 'rubrics', label: '评分标准', sub: 'RUBRICS' },
  { id: 'history', label: '历史报告', sub: 'ARCHIVE' },
  { id: 'appeals', label: '申诉', sub: 'APPEALS' },
];

interface HeaderProps {
  view: View;
  onNavigate: (view: View) => void;
  demoReady?: boolean;
  user?: AuthUser | null;
  onLogout?: () => void;
}

export default function Header({ view, onNavigate, demoReady, user, onLogout }: HeaderProps) {
  const navView = view === 'result' ? 'workbench' : view;
  return (
    <header className="topbar">
      <button className="brand" onClick={() => onNavigate('workbench')} aria-label="回到批改台">
        <span className="brand-seal">墨</span>
        <span className="brand-copy">
          <strong>墨析</strong>
          <small>MATH · GRADING STUDIO</small>
        </span>
      </button>

      <nav className="topnav" aria-label="主导航">
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`topnav-item ${navView === item.id ? 'is-active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span>{item.label}</span>
            <small>{item.sub}</small>
          </button>
        ))}
      </nav>

      <div className="topbar-right">
        <span className="local-pill" title="图片与密钥均在本机浏览器 / 服务器内处理">
          <span className="pulse-dot" />
          {demoReady ? 'LOCAL READY' : 'LOCAL'}
        </span>
        {user && (
          <span className={`user-pill ${user.role === 'admin' ? 'is-admin' : ''}`} title={user.role === 'admin' ? '超级管理员：可查看全部用户报告' : '当前用户'}>
            <UserRound size={13} />
            <b>{user.username}</b>
            {user.role === 'admin' && <small>管理员</small>}
          </span>
        )}
        {onLogout && (
          <button className="icon-button" onClick={onLogout} title="退出登录" aria-label="退出登录">
            <LogOut size={16} strokeWidth={1.8} />
          </button>
        )}
        <button
          className={`icon-button ${view === 'settings' ? 'is-active' : ''}`}
          onClick={() => onNavigate('settings')}
          title="接入设置"
          aria-label="接入设置"
        >
          <Settings2 size={17} strokeWidth={1.8} />
        </button>
        <button className="topbar-new" onClick={() => onNavigate('workbench')}>
          <Sparkles size={15} />
          新建批改
        </button>
      </div>
    </header>
  );
}

export function ViewHeading({
  eyebrow,
  title,
  description,
  actions,
  icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="view-heading">
      <div className="view-heading-copy">
        <div className="eyebrow">{icon}{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="view-heading-actions">{actions}</div> : null}
    </div>
  );
}

export const VIEW_ICONS = { rubrics: LibraryBig, history: History, workbench: BookOpenCheck };
