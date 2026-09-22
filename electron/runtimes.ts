import type { DetectedModel, RuntimeConfig } from './types';

const TIMEOUT_MS = 1300;

function cleanBaseUrl(url: string) {
  const cleaned = url.trim().replace(/\/+$/, '');
  const parsed = new URL(cleaned);
  const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
  if (!localHosts.has(parsed.hostname)) {
    throw new Error('For privacy, Local Room only connects to servers running on this computer.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('The server address must use http:// or https://.');
  }
  return cleaned;
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeout = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...init, signal: init?.signal ?? controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function inferredCapabilities(modelId: string) {
  const name = modelId.toLowerCase();
  const visionPatterns = [
    /(^|[-_:])vl($|[-_:0-9])/, /vision/, /llava/, /bakllava/, /moondream/,
    /gemma3/, /gemma-3/, /minicpm-v/, /mistral-small-3\.1/, /llama3\.2-vision/,
  ];
  return visionPatterns.some((pattern) => pattern.test(name)) ? ['vision'] : [];
}

export async function detectRuntime(runtime: RuntimeConfig): Promise<DetectedModel[]> {
  if (!runtime.enabled) return [];
  const base = cleanBaseUrl(runtime.baseUrl);

  try {
    if (runtime.type === 'ollama') {
      const response = await fetchWithTimeout(`${base}/api/tags`);
      if (!response.ok) return [];
      const json = (await response.json()) as { models?: Array<{ name: string; size?: number }> };
      return Promise.all((json.models ?? []).map(async (model) => {
        let capabilities = inferredCapabilities(model.name);
        let contextLength: number | undefined;
        try {
          const details = await fetchWithTimeout(`${base}/api/show`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: model.name, verbose: false }),
          });
          if (details.ok) {
            const detailJson = (await details.json()) as { capabilities?: string[]; model_info?: Record<string, unknown> };
            capabilities = detailJson.capabilities ?? capabilities;
            const contextEntry = Object.entries(detailJson.model_info ?? {}).find(([key, value]) => key.endsWith('.context_length') && typeof value === 'number');
            contextLength = typeof contextEntry?.[1] === 'number' ? contextEntry[1] : undefined;
          }
        } catch {
          // Older Ollama versions may not expose capabilities; use the model-name fallback.
        }
        return {
          id: model.name,
          name: model.name,
          runtimeId: runtime.id,
          runtimeName: runtime.name,
          runtimeType: runtime.type,
          size: model.size,
          capabilities,
          contextLength,
        } satisfies DetectedModel;
      }));
    }

    const response = await fetchWithTimeout(`${base}/models`);
    if (!response.ok) return [];
    const json = (await response.json()) as { data?: Array<{ id: string; max_context_length?: number; context_length?: number }> };
    const detailedModels = new Map<string, { max_context_length?: number; type?: string }>();
    try {
      const root = base.replace(/\/v1$/, '');
      const details = await fetchWithTimeout(`${root}/api/v0/models`);
      if (details.ok) {
        const detailJson = (await details.json()) as { data?: Array<{ id: string; max_context_length?: number; type?: string }> };
        detailJson.data?.forEach((model) => detailedModels.set(model.id, model));
      }
    } catch {
      // Generic OpenAI-compatible servers do not expose LM Studio's metadata endpoint.
    }
    return (json.data ?? []).map((model) => {
      const details = detailedModels.get(model.id);
      const capabilities = inferredCapabilities(model.id);
      if (details?.type === 'vlm' && !capabilities.includes('vision')) capabilities.push('vision');
      return {
        id: model.id,
        name: model.id,
        runtimeId: runtime.id,
        runtimeName: runtime.name,
        runtimeType: runtime.type,
        capabilities,
        contextLength: details?.max_context_length ?? model.max_context_length ?? model.context_length,
      };
    });
  } catch {
    return [];
  }
}

export async function detectAll(runtimes: RuntimeConfig[]) {
  return (await Promise.all(runtimes.map(detectRuntime))).flat();
}

type StreamArgs = {
  runtime: RuntimeConfig;
  model: string;
  messages: Array<{
    role: string;
    content: string;
    attachments?: Array<{ kind: 'image' | 'text'; name: string; mimeType: string; dataUrl?: string; text?: string }>;
  }>;
  temperature: number;
  signal: AbortSignal;
  onChunk: (text: string) => void;
};

function textWithFiles(message: StreamArgs['messages'][number]) {
  const files = (message.attachments ?? []).filter((attachment) => attachment.kind === 'text' && attachment.text);
  if (!files.length) return message.content;
  const fileContext = files.map((file) => `\n\n--- Attached file: ${file.name} ---\n${file.text}\n--- End file ---`).join('');
  return `${message.content}${fileContext}`;
}

async function readStream(response: Response, signal: AbortSignal, onLine: (line: string) => void) {
  if (!response.body) throw new Error('The local server did not return a response stream.');
  const reader = response.body.getReader();
  const cancelReader = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancelReader, { once: true });
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done || signal.aborted) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(onLine);
    }
    if (!signal.aborted && buffer.trim()) onLine(buffer);
  } finally {
    signal.removeEventListener('abort', cancelReader);
    if (signal.aborted) await reader.cancel().catch(() => undefined);
  }
}

export async function streamChat(args: StreamArgs) {
  const base = cleanBaseUrl(args.runtime.baseUrl);
  if (args.runtime.type === 'ollama') {
    const response = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: args.model,
        messages: args.messages.map((message) => ({
          role: message.role,
          content: textWithFiles(message),
          ...((message.attachments ?? []).some((attachment) => attachment.kind === 'image') ? {
            images: (message.attachments ?? [])
              .filter((attachment) => attachment.kind === 'image' && attachment.dataUrl)
              .map((attachment) => attachment.dataUrl!.replace(/^data:[^;]+;base64,/, '')),
          } : {}),
        })),
        stream: true,
        options: { temperature: args.temperature },
      }),
      signal: args.signal,
    });
    if (!response.ok) throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
    await readStream(response, args.signal, (line) => {
      if (!line.trim()) return;
      try {
        const item = JSON.parse(line) as { message?: { content?: string }; error?: string };
        if (item.error) throw new Error(item.error);
        if (item.message?.content) args.onChunk(item.message.content);
      } catch (error) {
        if (error instanceof SyntaxError) return;
        throw error;
      }
    });
    return;
  }

  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages.map((message) => {
        const text = textWithFiles(message);
        const images = (message.attachments ?? []).filter((attachment) => attachment.kind === 'image' && attachment.dataUrl);
        if (!images.length) return { role: message.role, content: text };
        return {
          role: message.role,
          content: [
            { type: 'text', text },
            ...images.map((attachment) => ({ type: 'image_url', image_url: { url: attachment.dataUrl } })),
          ],
        };
      }),
      temperature: args.temperature,
      stream: true,
    }),
    signal: args.signal,
  });
  if (!response.ok) throw new Error(`${args.runtime.name} returned ${response.status}: ${await response.text()}`);
  await readStream(response, args.signal, (line) => {
    const payload = line.replace(/^data:\s*/, '').trim();
    if (!payload || payload === '[DONE]') return;
    try {
      const item = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
      const content = item.choices?.[0]?.delta?.content;
      if (content) args.onChunk(content);
    } catch {
      // Ignore keep-alive or server-specific event lines.
    }
  });
}
