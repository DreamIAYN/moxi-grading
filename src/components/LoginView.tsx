import { useState } from 'react';
import { ArrowRight, KeyRound, LoaderCircle, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { loginUser, registerUser } from '../api';
import type { AuthUser } from '../types';

interface LoginViewProps {
  onAuth: (user: AuthUser) => void;
}

export default function LoginView({ onAuth }: LoginViewProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!username.trim()) return setError('请填写用户名。');
    if (password.length < 6) return setError('密码至少 6 位。');
    if (mode === 'register' && password !== confirm) return setError('两次输入的密码不一致。');
    setBusy(true);
    try {
      const user = mode === 'login'
        ? await loginUser(username.trim(), password)
        : await registerUser(username.trim(), password);
      onAuth(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请稍后重试。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-panel">
        <div className="login-brand">
          <span className="brand-seal">墨</span>
          <div><strong>墨析</strong><small>MATH · GRADING STUDIO</small></div>
        </div>
        <div className="login-copy">
          <span className="eyebrow">PRIVATE GRADING WORKSPACE</span>
          <h1>每个人的报告，<br /><em>只属于自己。</em></h1>
          <p>设置用户名和密码后，批改记录、评分标准与 PDF 只对本人可见。超级管理员可以查看全部报告。</p>
        </div>
        <div className="login-points">
          <span><Users size={14} /> 用户隔离</span>
          <span><ShieldCheck size={14} /> 密码只存哈希</span>
          <span><KeyRound size={14} /> 7 天登录状态</span>
        </div>
      </div>

      <form className="login-card" onSubmit={submit}>
        <div className="login-tabs">
          <button type="button" className={mode === 'login' ? 'is-active' : ''} onClick={() => { setMode('login'); setError(''); }}>登录</button>
          <button type="button" className={mode === 'register' ? 'is-active' : ''} onClick={() => { setMode('register'); setError(''); }}>注册新用户</button>
        </div>
        <div className="login-heading">
          <h2>{mode === 'login' ? '回到你的批改台' : '创建你的用户名'}</h2>
          <p>{mode === 'login' ? '输入用户名和密码，继续查看自己的报告。' : '第一次使用，设置一个只有你知道的用户名和密码。'}</p>
        </div>
        <label className="login-field">
          <span>用户名</span>
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="例如：小王" maxLength={24} />
        </label>
        <label className="login-field">
          <span>密码</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="至少 6 位" maxLength={72} />
        </label>
        {mode === 'register' && (
          <label className="login-field">
            <span>确认密码</span>
            <input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" placeholder="再输入一次" maxLength={72} />
          </label>
        )}
        {error && <p className="login-error">{error}</p>}
        <button className="login-submit" type="submit" disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={17} /> : mode === 'login' ? <ArrowRight size={17} /> : <UserPlus size={17} />}
          {busy ? '处理中…' : mode === 'login' ? '登录' : '注册并进入'}
        </button>
        <p className="login-note">超级管理员使用管理员账号登录，可查看所有用户的报告。普通用户只能看到自己的报告。</p>
      </form>
    </div>
  );
}
