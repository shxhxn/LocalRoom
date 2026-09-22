import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppData, Conversation, RuntimeConfig } from './types';

const DEFAULT_RUNTIMES: RuntimeConfig[] = [
  { id: 'ollama', name: 'Ollama', type: 'ollama', baseUrl: 'http://127.0.0.1:11434', enabled: true },
  { id: 'lm-studio', name: 'LM Studio', type: 'openai', baseUrl: 'http://127.0.0.1:1234/v1', enabled: true },
  { id: 'local-server', name: 'LocalAI / llama.cpp', type: 'openai', baseUrl: 'http://127.0.0.1:8080/v1', enabled: true },
];

const defaultData = (): AppData => ({
  conversations: [],
  runtimes: DEFAULT_RUNTIMES,
  settings: {
    systemPrompt: 'You are a helpful, thoughtful assistant. Be concise unless detail is useful.',
    temperature: 0.7,
    sidebarCollapsed: false,
  },
});

function dataPath() {
  return path.join(app.getPath('userData'), 'local-room-data.json');
}

export async function loadData(): Promise<AppData> {
  try {
    const parsed = JSON.parse(await fs.readFile(dataPath(), 'utf8')) as Partial<AppData>;
    const fallback = defaultData();
    return {
      conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
      runtimes: Array.isArray(parsed.runtimes) ? parsed.runtimes : fallback.runtimes,
      settings: { ...fallback.settings, ...(parsed.settings ?? {}) },
    };
  } catch {
    return defaultData();
  }
}

async function writeData(data: AppData) {
  const target = dataPath();
  const temp = `${target}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(temp, target);
}

export async function saveConversation(conversation: Conversation) {
  const data = await loadData();
  const index = data.conversations.findIndex((item) => item.id === conversation.id);
  if (index >= 0) data.conversations[index] = conversation;
  else data.conversations.unshift(conversation);
  await writeData(data);
  return conversation;
}

export async function deleteConversation(id: string) {
  const data = await loadData();
  data.conversations = data.conversations.filter((item) => item.id !== id);
  await writeData(data);
}

export async function mergeConversations(imported: Conversation[]) {
  const data = await loadData();
  const merged = new Map(data.conversations.map((conversation) => [conversation.id, conversation]));
  for (const conversation of imported) {
    const existing = merged.get(conversation.id);
    if (!existing || conversation.updatedAt >= existing.updatedAt) merged.set(conversation.id, conversation);
  }
  data.conversations = [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  await writeData(data);
  return data.conversations;
}

export async function saveRuntimes(runtimes: RuntimeConfig[]) {
  const data = await loadData();
  data.runtimes = runtimes;
  await writeData(data);
}

export async function saveSettings(settings: AppData['settings']) {
  const data = await loadData();
  data.settings = settings;
  await writeData(data);
}
