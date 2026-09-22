export type Role = 'user' | 'assistant' | 'system';

export interface Attachment {
  id: string;
  name: string;
  kind: 'image' | 'text';
  mimeType: string;
  size: number;
  dataUrl?: string;
  text?: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  attachments?: Attachment[];
  metrics?: {
    durationMs: number;
    timeToFirstTokenMs: number;
    estimatedTokens: number;
    tokensPerSecond: number;
  };
}

export interface Conversation {
  id: string;
  title: string;
  modelId: string;
  runtimeId: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
}

export interface RuntimeConfig {
  id: string;
  name: string;
  type: 'ollama' | 'openai';
  baseUrl: string;
  enabled: boolean;
  custom?: boolean;
}

export interface AppData {
  conversations: Conversation[];
  runtimes: RuntimeConfig[];
  settings: {
    systemPrompt: string;
    temperature: number;
    sidebarCollapsed: boolean;
  };
}

export interface DetectedModel {
  id: string;
  name: string;
  runtimeId: string;
  runtimeName: string;
  runtimeType: 'ollama' | 'openai';
  size?: number;
  capabilities: string[];
  contextLength?: number;
}
