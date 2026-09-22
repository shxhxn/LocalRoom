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

export interface AppSettings {
  systemPrompt: string;
  temperature: number;
  sidebarCollapsed: boolean;
}

export interface AppData {
  conversations: Conversation[];
  runtimes: RuntimeConfig[];
  settings: AppSettings;
}

export interface LocalRoomApi {
  loadData: () => Promise<AppData>;
  saveConversation: (conversation: Conversation) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  saveRuntimes: (runtimes: RuntimeConfig[]) => Promise<void>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  detectModels: (runtimes: RuntimeConfig[]) => Promise<DetectedModel[]>;
  pickAttachments: (kind: 'image' | 'file') => Promise<Attachment[]>;
  exportConversation: (conversation: Conversation) => Promise<boolean>;
  exportBackup: () => Promise<boolean>;
  importBackup: () => Promise<{ imported: number; conversations: Conversation[] } | null>;
  startChat: (payload: unknown) => Promise<string>;
  stopChat: (requestId: string) => void;
  onChatChunk: (callback: (payload: { requestId: string; text: string }) => void) => () => void;
  onChatDone: (callback: (payload: { requestId: string; stopped?: boolean }) => void) => () => void;
  onChatError: (callback: (payload: { requestId: string; message: string }) => void) => () => void;
}

declare global {
  interface Window {
    localRoom: LocalRoomApi;
  }
}
