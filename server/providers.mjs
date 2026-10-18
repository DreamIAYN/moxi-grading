import process from 'node:process';

export const PROVIDERS = [
  {
    id: 'demo',
    name: '演示模式',
    short: 'DEMO',
    baseUrl: '',
    protocol: 'mock',
    envKey: '',
    accent: '#8a7a5c',
    docs: '',
    models: [
      { id: 'demo', label: '内置示例阅卷人', vision: true, note: '不调用外部模型' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    short: 'DS',
    baseUrl: 'https://api.deepseek.com',
    protocol: 'OpenAI Chat Completions',
    envKey: 'DEEPSEEK_API_KEY',
    accent: '#365b7e',
    docs: 'https://api-docs.deepseek.com/zh-cn/',
    models: [
      { id: 'deepseek-flash', label: 'DeepSeek V4.1 Flash', vision: true, note: '支持图像；默认思考，速度优先选 GLM-5.3 Flash' },
      { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', vision: false, note: '纯文本，适合已转写的解答' },
    ],
  },
  {
    id: 'bigmodel',
    name: '智谱 BigModel',
    short: 'GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    protocol: 'OpenAI Chat Completions',
    envKey: 'BIGMODEL_API_KEY',
    accent: '#2f6b4f',
    docs: 'https://docs.bigmodel.cn/',
    models: [
      { id: 'glm-4.6v', label: 'GLM-4.6V', vision: true, note: '视觉推理，手写识别推荐' },
      { id: 'glm-4.6v-flash', label: 'GLM-4.6V Flash', vision: true, note: '轻量免费，速度优先' },
      { id: 'glm-5.3', label: 'GLM-5.3', vision: false, note: '纯文本强推理' },
    ],
  },
  {
    id: 'opencode',
    name: 'OpenCode Zen',
    short: 'ZEN',
    baseUrl: 'https://opencode.ai/zen/v1',
    protocol: 'OpenAI 兼容端点',
    envKey: 'OPENCODE_API_KEY',
    accent: '#6b4c7a',
    docs: 'https://opencode.ai/docs/zen',
    models: [
      { id: 'glm-5.3-flash', label: 'GLM-5.3 Flash via Zen', vision: true, note: '视觉 · thinking 已启用（low）' },
      { id: 'glm-5.3', label: 'GLM-5.3 via Zen', vision: false, note: '纯文本强推理' },
      { id: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash via Zen', vision: true, note: '推理型，通常比 GLM 慢；速度优先选 GLM-5.3 Flash' },
      { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro via Zen', vision: false },
    ],
  },
];

export function publicProviders() {
  return PROVIDERS.map((provider) => ({
    id: provider.id,
    name: provider.name,
    short: provider.short,
    baseUrl: provider.baseUrl,
    protocol: provider.protocol,
    envKey: provider.envKey,
    accent: provider.accent,
    docs: provider.docs,
    models: provider.models,
    serverKeyConfigured: provider.id === 'demo' ? true : Boolean(provider.envKey && process.env[provider.envKey]),
  }));
}

export function getProvider(id) {
  return PROVIDERS.find((provider) => provider.id === id);
}

export function resolveApiKey(provider, suppliedKey) {
  if (provider.id === 'demo') return '';
  return (suppliedKey || '').trim() || (provider.envKey ? process.env[provider.envKey] || '' : '');
}

export function isKnownTextOnly(providerId, model) {
  const provider = getProvider(providerId);
  const found = provider?.models.find((item) => item.id === model);
  return Boolean(found && found.vision === false);
}

export function normalizeBaseUrl(provider, override) {
  const raw = (override || provider.baseUrl || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  return raw;
}

function extractMessageContent(payload) {
  const choice = payload?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text') return part.text || '';
        return '';
      })
      .join('');
  }
  if (typeof payload?.output_text === 'string') return payload.output_text;
  return '';
}

async function postJson(url, apiKey, body, timeoutMs = 240_000, externalSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const signal = externalSignal && typeof AbortSignal.any === 'function'
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal;
  try {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal,
        });
        const raw = await response.text();
        let data = null;
        try {
          data = raw ? JSON.parse(raw) : null;
        } catch {
          data = null;
        }
        if (!response.ok) {
          const detail =
            data?.error?.message ||
            data?.message ||
            data?.error ||
            raw.slice(0, 500) ||
            `HTTP ${response.status}`;
          const error = new Error(`模型接口返回 ${response.status}：${detail}`);
          error.status = response.status;
          error.detail = detail;
          error.raw = raw;
          // Retry transient upstream failures, not auth/validation errors.
          if ((response.status === 429 || response.status >= 500) && attempt < 2) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
            continue;
          }
          throw error;
        }
        return data;
      } catch (error) {
        if (error.status) throw error;
        if (externalSignal?.aborted || error.name === 'AbortError') throw error;
        if (attempt < 2) {
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
          continue;
        }
        throw error;
      }
    }
    throw lastError || new Error('模型接口请求失败');
  } finally {
    clearTimeout(timeout);
  }
}

function buildBody({ model, systemPrompt, userContent, jsonMode, maxTokens, temperature, reasoningEffort }) {
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature,
    max_tokens: maxTokens,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  // User-selected default: GLM-5.3-Flash with thinking enabled. `high`
  // leaves enough output budget for the structured JSON while still doing
  // multi-step verification of the handwritten solution.
  if (/^glm-5\.3/i.test(model)) {
    body.thinking = { type: 'enabled' };
    // Thinking stays enabled. `low` prevents the reasoning trace from eating
    // the whole output budget when the model must return a long JSON object.
    body.reasoning_effort = reasoningEffort || 'low';
  } else if (/^deepseek-(v4|flash|reasoner)/i.test(model)) {
    // DeepSeek V4.x defaults to heavy thinking. Keep thinking on, but bound
    // its effort so grading JSON is actually emitted in reasonable time.
    body.thinking = { type: 'enabled' };
    body.reasoning_effort = reasoningEffort || 'low';
  }
  return body;
}

/**
 * OpenAI-compatible chat completion with a graceful retry for providers that
 * reject response_format or max_tokens. The provider layer is intentionally
 * thin so a new vendor only needs a base URL + model capability entry.
 */
export async function callChatModel({
  baseUrl,
  apiKey,
  model,
  systemPrompt,
  userContent,
  jsonMode = true,
  maxTokens = 16000,
  temperature = 0.15,
  reasoningEffort = 'low',
  signal,
}) {
  if (!apiKey) throw new Error('缺少 API Key');
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  let body = buildBody({ model, systemPrompt, userContent, jsonMode, maxTokens, temperature, reasoningEffort });
  let data;
  try {
    data = await postJson(endpoint, apiKey, body, 240_000, signal);
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('模型请求超时。竞赛手写稿较大时，可减少页数或改用更快的视觉模型。');
      timeoutError.status = 504;
      throw timeoutError;
    }
    if (error instanceof TypeError && /fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(String(error.message))) {
      const networkError = new Error(`无法连接模型接口（${endpoint}）。请检查 Base URL、本机网络或代理设置。`);
      networkError.status = 502;
      throw networkError;
    }
    const detail = String(error.detail || error.message || '');
    if (jsonMode && /response_format|json_object|not support|unsupported/i.test(detail)) {
      body = buildBody({ model, systemPrompt, userContent, jsonMode: false, maxTokens, temperature, reasoningEffort });
      data = await postJson(endpoint, apiKey, body, 240_000, signal);
    } else if (/thinking|reasoning_effort|reasoning/i.test(detail)) {
      delete body.thinking;
      delete body.reasoning_effort;
      data = await postJson(endpoint, apiKey, body, 240_000, signal);
    } else if (/max_tokens|max_completion_tokens|temperature/i.test(detail)) {
      delete body.max_tokens;
      delete body.temperature;
      data = await postJson(endpoint, apiKey, body, 240_000, signal);
    } else {
      throw error;
    }
  }

  let content = extractMessageContent(data);
  let choice = data?.choices?.[0];
  if (!content) {
    const finishReason = choice?.finish_reason;
    const hasReasoning = Boolean(choice?.message?.reasoning_content);
    console.warn('[provider] empty content', {
      model,
      finishReason,
      hasReasoning,
      outputTokens: data?.usage?.completion_tokens,
    });
    // Structured grading often uses a long reasoning trace. Retry once with a
    // larger output budget and the lowest thinking effort, still keeping
    // thinking enabled. This avoids surfacing a generic 500 to the user.
    try {
      const retryBody = buildBody({
        model,
        systemPrompt,
        userContent,
        jsonMode: false,
        maxTokens: 20000,
        temperature,
        reasoningEffort: 'low',
      });
      data = await postJson(endpoint, apiKey, retryBody, 240_000, signal);
      content = extractMessageContent(data);
      choice = data?.choices?.[0];
    } catch (retryError) {
      console.warn('[provider] empty-content retry failed', { model, message: retryError.message });
    }
  }
  if (!content) {
    const refusal = choice?.message?.refusal;
    const finishReason = choice?.finish_reason;
    const reason = finishReason === 'length'
      ? '模型把输出预算全部用于思考，未生成最终答案。'
      : '模型没有返回最终答案。';
    const error = new Error(`${refusal ? `模型拒绝生成：${refusal}` : reason} 请重试，或改用非思考/低思考模型。`);
    error.status = 502;
    throw error;
  }
  return {
    content,
    usage: {
      inputTokens: data?.usage?.prompt_tokens ?? data?.usage?.input_tokens,
      outputTokens: data?.usage?.completion_tokens ?? data?.usage?.output_tokens,
    },
  };
}

export async function testProvider({ baseUrl, apiKey, model }) {
  const started = Date.now();
  const data = await callChatModel({
    baseUrl,
    apiKey,
    model,
    systemPrompt: '你是连通性测试助手，只回复“OK”。',
    userContent: '请回复 OK',
    jsonMode: false,
    maxTokens: 2048,
    temperature: 0,
  });
  return { ok: true, latencyMs: Date.now() - started, sample: data.content.slice(0, 80) };
}
