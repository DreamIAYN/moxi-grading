import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  PlugZap,
  ServerCog,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { FALLBACK_PROVIDERS } from '../lib';
import { testConnection } from '../api';
import type { AppConfig, ProviderId, ProviderInfo, StoredSettings } from '../types';
import { ViewHeading } from './Header';

interface SettingsViewProps {
  config: AppConfig | null;
  settings: StoredSettings;
  onChange: (settings: StoredSettings) => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'error') => void;
}

export default function SettingsView({ config, settings, onChange, onToast }: SettingsViewProps) {
  const providers = config?.providers || FALLBACK_PROVIDERS;
  const realProviders = providers.filter((provider) => provider.id !== 'demo');
  const [activeId, setActiveId] = useState<ProviderId>(() => (settings.providerId === 'demo' ? 'deepseek' : settings.providerId));
  const [showKeys, setShowKeys] = useState<Partial<Record<ProviderId, boolean>>>({});
  const [testing, setTesting] = useState<ProviderId | null>(null);
  const [testResult, setTestResult] = useState<Partial<Record<ProviderId, { ok: boolean; message: string }>>>({});

  const active = providers.find((provider) => provider.id === activeId) || realProviders[0];
  const activeKey = settings.apiKeys[active.id] || '';
  const activeBaseUrl = settings.baseUrls[active.id] ?? active.baseUrl;
  const model = useMemo(() => {
    if (active.id === settings.providerId && settings.model) return settings.model;
    return active.models.find((item) => item.vision)?.id || active.models[0]?.id || '';
  }, [active, settings.providerId, settings.model]);

  function updateProvider(patch: Partial<StoredSettings>) {
    onChange({ ...settings, ...patch });
  }

  async function runTest(provider: ProviderInfo) {
    setTesting(provider.id);
    setTestResult((current) => ({ ...current, [provider.id]: undefined }));
    try {
      const key = settings.apiKeys[provider.id] || '';
      const result = await testConnection({
        providerId: provider.id,
        model: provider.id === settings.providerId && settings.model ? settings.model : (provider.models.find((m) => m.vision)?.id || provider.models[0]?.id || ''),
        baseUrl: settings.baseUrls[provider.id] || undefined,
        apiKey: key || undefined,
      });
      setTestResult((current) => ({
        ...current,
        [provider.id]: { ok: true, message: `连接成功 · ${result.latencyMs}ms · ${result.model}` },
      }));
      onToast(`${provider.name} 连接成功。`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '连接失败';
      setTestResult((current) => ({ ...current, [provider.id]: { ok: false, message } }));
      onToast(message, 'error');
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="settings-view">
      <ViewHeading
        eyebrow="MODEL CONNECTIONS"
        title="接入你的阅卷模型。"
        description="DeepSeek、智谱 BigModel、OpenCode Zen 均使用 OpenAI 兼容接口。更改会即时保存在本机浏览器；密钥不会写入报告或任务文件，服务端密钥通过环境变量注入。"
        icon={<PlugZap size={14} />}
      />

      <div className="settings-layout">
        <aside className="settings-nav">
          {realProviders.map((provider) => {
            const ready = provider.serverKeyConfigured || Boolean(settings.apiKeys[provider.id]);
            return (
              <button key={provider.id} className={active.id === provider.id ? 'is-active' : ''} onClick={() => setActiveId(provider.id)}>
                <span className="settings-provider-mark" style={{ color: provider.accent }}>{provider.short}</span>
                <span><strong>{provider.name}</strong><small>{provider.serverKeyConfigured ? '服务端已配置' : ready ? '本地密钥已保存' : '待配置'}</small></span>
                <span className={`status-pip ${ready ? 'is-ready' : ''}`} />
              </button>
            );
          })}
          <div className="settings-nav-note">
            <ShieldCheck size={16} />
            <p>密钥不会写入报告、日志或任务文件。浏览器只向本机服务转发请求，再由服务端调用所选模型。</p>
          </div>
        </aside>

        <div className="settings-main">
          <section className="settings-card provider-head-card">
            <div>
              <div className="eyebrow">{active.short} CONNECTION</div>
              <h2>{active.name}</h2>
              <p>{active.protocol}</p>
            </div>
            <div className="provider-head-actions">
              {active.serverKeyConfigured && <span className="server-key-badge"><ServerCog size={13} /> 服务端密钥可用</span>}
              <button className="ghost-button" onClick={() => {
                onChange({ ...settings, providerId: active.id, model });
                onToast(`已将 ${active.name} / ${model} 设为批改台默认模型。`, 'success');
              }}>设为批改默认</button>
              <a href={active.docs} target="_blank" rel="noreferrer" className="ghost-button">官方文档 <ExternalLink size={13} /></a>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-head">
              <h3>接口配置</h3>
              <span>当前模型：{model}</span>
            </div>
            <label className="field field-wide">
              <span>Base URL <small>兼容 OpenAI Chat Completions</small></span>
              <input
                value={activeBaseUrl}
                onChange={(event) => updateProvider({ baseUrls: { ...settings.baseUrls, [active.id]: event.target.value } })}
                spellCheck={false}
              />
            </label>
            <label className="field field-wide">
              <span>API Key <small>{active.envKey ? `也可设置环境变量 ${active.envKey}` : ''}</small></span>
              <div className="key-input-wrap">
                <KeyRound size={15} />
                <input
                  type={showKeys[active.id] ? 'text' : 'password'}
                  value={activeKey}
                  onChange={(event) => updateProvider({ apiKeys: { ...settings.apiKeys, [active.id]: event.target.value } })}
                  placeholder={active.serverKeyConfigured ? '留空则使用服务端密钥' : '粘贴 API Key'}
                  autoComplete="new-password"
                  spellCheck={false}
                />
                <button type="button" onClick={() => setShowKeys((current) => ({ ...current, [active.id]: !current[active.id] }))}>
                  {showKeys[active.id] ? '隐藏' : '显示'}
                </button>
              </div>
            </label>
            <div className="settings-model-list">
              <span className="config-label">可用模型</span>
              {active.models.map((item) => (
                <div className="settings-model" key={item.id}>
                  <span className={`status-pip ${item.vision ? 'is-ready' : ''}`} />
                  <strong>{item.label}</strong>
                  <code>{item.id}</code>
                  <span className="model-vision">{item.vision ? '视觉' : '纯文本'}</span>
                  <p>{item.note}</p>
                </div>
              ))}
              <p className="field-note">模型目录会随服务商更新。若使用新模型，可在批改台的「高级选项」中直接填写模型名。</p>
              {active.id === 'opencode' && <p className="field-note">OpenCode Zen 的部分模型使用 Responses / Anthropic 协议；本应用默认调用 OpenAI 兼容的 chat/completions，请选择表中兼容模型。</p>}
            </div>

            <div className="settings-actions-row">
              <button className="primary-cta small" onClick={() => runTest(active)} disabled={testing === active.id || (!activeKey && !active.serverKeyConfigured)}>
                {testing === active.id ? <LoaderCircle className="spin" size={15} /> : <PlugZap size={15} />}
                {testing === active.id ? '测试中…' : '测试连接'}
              </button>
              {activeKey && (
                <button className="text-button danger" onClick={() => {
                  const next = { ...settings.apiKeys };
                  delete next[active.id];
                  updateProvider({ apiKeys: next });
                  onToast('本地密钥已清除。', 'info');
                }}><Trash2 size={13} /> 清除本地密钥</button>
              )}
              {testResult[active.id] && (
                <span className={`test-result ${testResult[active.id]?.ok ? 'is-ok' : 'is-fail'}`}>
                  {testResult[active.id]?.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  {testResult[active.id]?.message}
                </span>
              )}
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-head">
              <h3>报告与排版</h3>
              <span>{config?.pdfAvailable ? 'PDF 引擎就绪' : 'PDF 引擎不可用'}</span>
            </div>
            <div className={`engine-box ${config?.pdfAvailable ? 'is-ready' : 'is-fail'}`}>
              {config?.pdfAvailable ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
              <div>
                <strong>{config?.pdfAvailable ? 'XeLaTeX 已连接' : '未找到 XeLaTeX'}</strong>
                <p>{config?.pdfAvailable ? (config.texVersion || '可生成含中文、公式与图片批注的 PDF。') : '安装 TeX Live 并确保 xelatex 在 PATH 中，或设置环境变量 TEX_BIN。'}</p>
              </div>
            </div>
            <label className="field">
              <span>默认尺度</span>
              <select
                value={settings.strictness}
                onChange={(event) => updateProvider({ strictness: event.target.value as StoredSettings['strictness'] })}
              >
                <option value="standard">标准</option>
                <option value="strict">从严</option>
                <option value="encouraging">鼓励</option>
              </select>
            </label>
            <div className="security-note">
              <LockKeyhole size={16} />
              <p><strong>隐私边界</strong>：图片与题目只会发送到你选择的模型服务商；报告与图片保存在本机 <code>data/jobs</code>。API Key 不写入任务文件。</p>
            </div>
          </section>

          <section className="settings-card env-card">
            <div className="settings-card-head">
              <h3>服务端环境变量</h3>
              <span>适合多人部署</span>
            </div>
            <div className="env-grid">
              {realProviders.map((provider) => (
                <div key={provider.id}>
                  <code>{provider.envKey}</code>
                  <span className={provider.serverKeyConfigured ? 'env-ok' : 'env-missing'}>
                    {provider.serverKeyConfigured ? <><CheckCircle2 size={12} /> 已配置</> : <><CircleAlert size={12} /> 未配置</>}
                  </span>
                </div>
              ))}
            </div>
            <p className="field-note">在项目根目录创建 <code>.env</code>（参考 <code>.env.example</code>）并重启服务即可。页面中填写的密钥优先级更高。</p>
          </section>
        </div>
      </div>
    </div>
  );
}
