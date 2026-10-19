import { useEffect, useRef, useState } from 'react';
import Header, { type View } from './components/Header';
import Workbench from './components/Workbench';
import ResultView from './components/ResultView';
import RubricLibrary from './components/RubricLibrary';
import HistoryView from './components/HistoryView';
import AppealsView from './components/AppealsView';
import SettingsView from './components/SettingsView';
import LoginView from './components/LoginView';
import Toast, { type ToastState } from './components/Toast';
import { fetchAppConfig, fetchAuthMe, logoutUser } from './api';
import { loadSettings, saveSettings } from './lib';
import type { AppConfig, AuthUser, GradingResult, StoredSettings } from './types';

function initialView(): View {
  const hash = window.location.hash.replace('#', '');
  if (['workbench', 'rubrics', 'history', 'appeals', 'settings'].includes(hash)) return hash as View;
  return 'workbench';
}

export default function App() {
  const [view, setView] = useState<View>(() => initialView());
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [settings, setSettings] = useState<StoredSettings>(() => loadSettings());
  const [result, setResult] = useState<GradingResult | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [workbenchKey, setWorkbenchKey] = useState(0);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    fetchAuthMe()
      .then((current) => setUser(current))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchAppConfig()
      .then(setConfig)
      .catch((error) => {
        notify(error instanceof Error ? error.message : '服务配置读取失败', 'error');
      });
  }, [user]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    window.history.replaceState(null, '', `#${view}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [view]);

  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash.replace('#', '') as View;
      if (['workbench', 'rubrics', 'history', 'appeals', 'settings', 'result'].includes(hash)) setView(hash);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  function notify(message: string, tone: 'info' | 'success' | 'error' = 'info') {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), tone === 'error' ? 7000 : 4500);
  }

  function openResult(next: GradingResult) {
    setResult(next);
    setView('result');
  }


  function handleAuth(nextUser: AuthUser) {
    setUser(nextUser);
    setView('workbench');
  }

  async function handleLogout() {
    await logoutUser().catch(() => undefined);
    setUser(null);
    setResult(null);
    setView('workbench');
  }

  function startNew() {
    setResult(null);
    setWorkbenchKey((key) => key + 1);
    setView('workbench');
  }

  const effectiveView = view === 'result' && !result ? 'workbench' : view;

  if (authLoading) {
    return <div className="auth-loading"><span className="brand-seal">墨</span><p>正在读取登录状态…</p></div>;
  }

  if (!user) {
    return <LoginView onAuth={handleAuth} />;
  }

  return (
    <div className="app-shell">
      <Header view={effectiveView} onNavigate={setView} demoReady={Boolean(config?.demoAvailable)} user={user} onLogout={handleLogout} />
      <main className="app-main">
        <div style={{ display: effectiveView === 'workbench' ? 'block' : 'none' }}>
          <Workbench
            key={workbenchKey}
            config={config}
            settings={settings}
            onSettingsChange={setSettings}
            onResult={openResult}
            onToast={notify}
            onNavigateRubrics={() => setView('rubrics')}
            onNavigateSettings={() => setView('settings')}
          />
        </div>
        {effectiveView === 'result' && result && (
          <ResultView result={result} onBack={() => setView('workbench')} onNew={startNew} onToast={notify} />
        )}
        {effectiveView === 'rubrics' && <RubricLibrary onToast={notify} />}
        {effectiveView === 'history' && (
          <HistoryView
            user={user}
            onOpen={openResult}
            onNew={() => setView('workbench')}
            onToast={notify}
          />
        )}
        {effectiveView === 'appeals' && <AppealsView user={user} onToast={notify} />}
        {effectiveView === 'settings' && (
          <SettingsView config={config} settings={settings} onChange={setSettings} onToast={notify} />
        )}
      </main>
      <footer className="site-footer">
        <div>
          <span className="brand-seal small">墨</span>
          <p><strong>墨析</strong> · 数学竞赛批改工作台</p>
        </div>
        <p>先解题，再评分，后批注。AI 辅助结果请结合教师复核。</p>
        <span className="footer-version">v1.0 · LOCAL FIRST</span>
      </footer>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
