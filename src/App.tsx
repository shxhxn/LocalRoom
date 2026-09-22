import { ClipboardEvent as ReactClipboardEvent, CSSProperties, FormEvent, KeyboardEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, Bot, ChevronDown, CircleHelp, Menu,
  Download, Eye, FileText, Image as ImageIcon, MessageSquareText, MoreHorizontal, PanelLeftClose, Pencil, Plus, Search,
  Paperclip, Pin, Send, Settings, Share2, Square, Trash2, WifiOff, X,
  ExternalLink, ShieldCheck,
} from 'lucide-react';
import type { AppData, AppSettings, Attachment, ChatMessage, Conversation, DetectedModel, RuntimeConfig } from './types';
import { Logo } from './components/Logo';
import { MessageBubble } from './components/MessageBubble';
import { SettingsPanel } from './components/Settings';

const emptyData: AppData = {
  conversations: [], runtimes: [],
  settings: { systemPrompt: '', temperature: 0.7, sidebarCollapsed: false },
};

function uid() { return crypto.randomUUID(); }

function formatSize(bytes?: number) {
  if (!bytes) return '';
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatAttachmentSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

type GenerationState = {
  requestId: string;
  conversationId: string;
  startedAt: number;
  firstTokenAt?: number;
};

function estimateTokens(text: string) {
  return Math.max(0, Math.ceil(text.length / 4));
}

function formatTokenCount(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : String(value);
}

function contextualSnippet(text: string, query: string) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const match = clean.toLowerCase().indexOf(query);
  if (match < 0) return clean.slice(0, 180);
  const start = Math.max(0, match - 58);
  const end = Math.min(clean.length, match + query.length + 118);
  return `${start ? '…' : ''}${clean.slice(start, end)}${end < clean.length ? '…' : ''}`;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const match = text.toLowerCase().indexOf(query);
  if (match < 0) return <>{text}</>;
  return <>{text.slice(0, match)}<mark>{text.slice(match, match + query.length)}</mark>{text.slice(match + query.length)}</>;
}

function LinkedInMark() {
  return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M0 1.15C0 .51.53 0 1.18 0h13.65C15.47 0 16 .51 16 1.15v13.7c0 .64-.53 1.15-1.17 1.15H1.18C.53 16 0 15.49 0 14.85V1.15Zm4.94 12.24V6.17h-2.4v7.22h2.4ZM3.74 5.18c.84 0 1.36-.55 1.36-1.25-.02-.7-.52-1.24-1.34-1.24-.82 0-1.36.54-1.36 1.24 0 .7.52 1.25 1.33 1.25h.01Zm2.53 8.21h2.4V9.36c0-.22.01-.43.08-.59.17-.43.57-.88 1.23-.88.87 0 1.22.67 1.22 1.64v3.86h2.4V9.25C13.6 7.03 12.42 6 10.84 6 9.56 6 8.99 6.7 8.67 7.19v.03h-.02l.02-.03V6.17h-2.4c.03.68 0 7.22 0 7.22Z" /></svg>;
}

function GitHubMark() {
  return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.39l-.01-1.49c-2.23.49-2.7-1.08-2.7-1.08-.37-.93-.9-1.18-.9-1.18-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.67.07-.52.28-.87.51-1.07-1.78-.2-3.65-.89-3.65-3.96 0-.88.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.22 2.2.82A7.63 7.63 0 0 1 8 3.71c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.08-1.87 3.75-3.66 3.95.29.25.54.74.54 1.5l-.01 2.32c0 .22.15.47.55.39A8 8 0 0 0 8 0Z" /></svg>;
}

function CreatorCredit({ compact = false }: { compact?: boolean }) {
  return <div className={`creator-credit ${compact ? 'creator-credit--compact' : ''}`}>
    <button className="creator-trigger" type="button" aria-label="About the creator">
      {compact ? <span className="creator-monogram">SS</span> : <><span>Made by</span><b>Shahan</b></>}
    </button>
    <div className="creator-popover" role="dialog" aria-label="Creator links">
      <div className="creator-popover-head"><span>CREATOR</span><b>Shahan Samar</b><small>Designer and developer of Local Room</small></div>
      <a href="https://www.linkedin.com/in/shahan-samar-603063371/" target="_blank" rel="noreferrer">
        <i className="creator-link-icon linkedin"><LinkedInMark /></i><span><b>Shahan Samar</b><small>LinkedIn</small></span><ExternalLink size={13} />
      </a>
      <a href="https://github.com/shxhxn" target="_blank" rel="noreferrer">
        <i className="creator-link-icon github"><GitHubMark /></i><span><b>shxhxn</b><small>GitHub</small></span><ExternalLink size={13} />
      </a>
    </div>
  </div>;
}

function App() {
  const [data, setData] = useState<AppData>(emptyData);
  const [models, setModels] = useState<DetectedModel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [preferredModel, setPreferredModel] = useState<{ id: string; runtimeId: string } | null>(null);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [generating, setGenerating] = useState<GenerationState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [conversationMenu, setConversationMenu] = useState<{ id: string; left: number; top: number } | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<{ id: string; value: string } | null>(null);
  const [filesPanelOpen, setFilesPanelOpen] = useState(false);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => Math.min(390, Math.max(230, Number(localStorage.getItem('local-room-sidebar-width')) || 278)));
  const [filesPanelWidth, setFilesPanelWidth] = useState(() => Math.min(520, Math.max(290, Number(localStorage.getItem('local-room-files-width')) || 360)));
  const conversationsRef = useRef<Conversation[]>([]);
  const generatingRef = useRef<GenerationState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resizeRef = useRef<{ kind: 'sidebar' | 'files'; startX: number; startWidth: number } | null>(null);

  const updateConversations = (updater: (current: Conversation[]) => Conversation[]) => {
    const conversations = updater(conversationsRef.current);
    conversationsRef.current = conversations;
    setData((current) => ({ ...current, conversations }));
  };

  const scanModels = async (runtimes = data.runtimes) => {
    setScanning(true);
    try {
      const found = await window.localRoom.detectModels(runtimes);
      setModels(found);
      setPreferredModel((current) => current && found.some((model) => model.id === current.id && model.runtimeId === current.runtimeId)
        ? current
        : found[0] ? { id: found[0].id, runtimeId: found[0].runtimeId } : null);
    }
    finally { setScanning(false); }
  };

  useEffect(() => {
    void window.localRoom.loadData().then((loadedData) => {
      conversationsRef.current = loadedData.conversations;
      setData(loadedData);
      setActiveId([...loadedData.conversations].sort((a, b) => b.createdAt - a.createdAt)[0]?.id ?? null);
      setLoaded(true);
      void scanModels(loadedData.runtimes);
    });
  }, []);

  useEffect(() => {
    const offChunk = window.localRoom.onChatChunk(({ requestId, text }) => {
      const currentRequest = generatingRef.current;
      if (!currentRequest || currentRequest.requestId !== requestId) return;
      if (!currentRequest.firstTokenAt) currentRequest.firstTokenAt = Date.now();
      updateConversations((current) => current.map((conversation) => conversation.id !== currentRequest.conversationId ? conversation : {
        ...conversation,
        messages: conversation.messages.map((message, index) => index === conversation.messages.length - 1 ? { ...message, content: message.content + text } : message),
        updatedAt: Date.now(),
      }));
    });
    const finish = ({ requestId }: { requestId: string }) => {
      const currentRequest = generatingRef.current;
      if (!currentRequest || currentRequest.requestId !== requestId) return;
      const finishedAt = Date.now();
      updateConversations((current) => current.map((conversation) => {
        if (conversation.id !== currentRequest.conversationId) return conversation;
        const messages = conversation.messages.map((message, index) => {
          if (index !== conversation.messages.length - 1 || message.role !== 'assistant' || !message.content) return message;
          const estimatedTokens = estimateTokens(message.content);
          const outputDurationMs = Math.max(1, finishedAt - (currentRequest.firstTokenAt ?? currentRequest.startedAt));
          return { ...message, metrics: {
            durationMs: finishedAt - currentRequest.startedAt,
            timeToFirstTokenMs: (currentRequest.firstTokenAt ?? finishedAt) - currentRequest.startedAt,
            estimatedTokens,
            tokensPerSecond: estimatedTokens / (outputDurationMs / 1000),
          } };
        });
        return { ...conversation, messages };
      }));
      generatingRef.current = null;
      setGenerating(null);
      const conversation = conversationsRef.current.find((item) => item.id === currentRequest.conversationId);
      if (conversation) void window.localRoom.saveConversation(conversation);
    };
    const offDone = window.localRoom.onChatDone(finish);
    const offError = window.localRoom.onChatError(({ requestId, message }) => {
      setNotice(message);
      finish({ requestId });
    });
    return () => { offChunk(); offDone(); offError(); };
  }, []);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const scroller = scrollRef.current;
      if (!scroller || !stickToBottomRef.current) return;
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: generating ? 'auto' : 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [data.conversations, generating]);

  useEffect(() => {
    stickToBottomRef.current = true;
    setShowJumpToBottom(false);
    const frame = window.requestAnimationFrame(() => {
      const scroller = scrollRef.current;
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeId]);

  useEffect(() => {
    const dismissFloatingMenus = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-floating-ui]')) return;
      setModelMenuOpen(false);
      setAttachmentMenuOpen(false);
      setConversationMenu(null);
      setHeaderMenuOpen(false);
    };
    const dismissWithEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setModelMenuOpen(false);
      setAttachmentMenuOpen(false);
      setConversationMenu(null);
      setHeaderMenuOpen(false);
      setFilesPanelOpen(false);
    };
    document.addEventListener('pointerdown', dismissFloatingMenus);
    document.addEventListener('keydown', dismissWithEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissFloatingMenus);
      document.removeEventListener('keydown', dismissWithEscape);
    };
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
  }, [draft]);

  useEffect(() => {
    localStorage.setItem('local-room-sidebar-width', String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem('local-room-files-width', String(filesPanelWidth));
  }, [filesPanelWidth]);

  useEffect(() => {
    const resize = (event: globalThis.PointerEvent) => {
      const current = resizeRef.current;
      if (!current) return;
      if (current.kind === 'sidebar') {
        setSidebarWidth(Math.min(390, Math.max(230, current.startWidth + event.clientX - current.startX)));
      } else {
        setFilesPanelWidth(Math.min(520, Math.max(290, current.startWidth + current.startX - event.clientX)));
      }
    };
    const finishResize = () => {
      if (!resizeRef.current) return;
      resizeRef.current = null;
      document.body.classList.remove('resizing-panels');
    };
    document.addEventListener('pointermove', resize);
    document.addEventListener('pointerup', finishResize);
    document.addEventListener('pointercancel', finishResize);
    return () => {
      document.removeEventListener('pointermove', resize);
      document.removeEventListener('pointerup', finishResize);
      document.removeEventListener('pointercancel', finishResize);
      document.body.classList.remove('resizing-panels');
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        newChat();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        expandSidebar(true);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  });

  const active = data.conversations.find((conversation) => conversation.id === activeId) ?? null;
  const selectedModel = active
    ? models.find((model) => model.id === active.modelId && model.runtimeId === active.runtimeId)
    : models.find((model) => model.id === preferredModel?.id && model.runtimeId === preferredModel.runtimeId) ?? models[0];
  const contextTokens = useMemo(() => estimateTokens([
    data.settings.systemPrompt,
    ...(active?.messages.map((message) => `${message.role}: ${message.content}${message.attachments?.map((attachment) => attachment.text ?? '').join('') ?? ''}`) ?? []),
    draft,
    ...pendingAttachments.map((attachment) => attachment.text ?? ''),
  ].join('\n')), [active?.messages, data.settings.systemPrompt, draft, pendingAttachments]);
  const contextLimit = selectedModel?.contextLength;
  const contextPercent = contextLimit ? Math.min(100, Math.round((contextTokens / contextLimit) * 100)) : 0;
  const chatFiles = useMemo(() => active?.messages.flatMap((message) => (message.attachments ?? []).map((attachment) => ({
    attachment,
    messageId: message.id,
    createdAt: message.createdAt,
  }))) ?? [], [active?.messages]);
  const normalizedSearch = search.trim().toLowerCase();
  const sorted = useMemo(() => [...data.conversations]
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.createdAt - a.createdAt), [data.conversations, normalizedSearch]);
  const groups = useMemo(() => sorted.reduce<Record<string, Conversation[]>>((result, conversation) => {
    const label = conversation.pinned ? 'Pinned' : 'Recents';
    (result[label] ??= []).push(conversation);
    return result;
  }, {}), [sorted, normalizedSearch]);
  const searchResults = useMemo(() => {
    if (!normalizedSearch) return [];
    return sorted.flatMap((conversation) => {
      const results: Array<{ conversation: Conversation; messageId?: string; snippet: string; label: string }> = [];
      if (conversation.title.toLowerCase().includes(normalizedSearch)) {
        results.push({ conversation, snippet: conversation.title, label: 'Conversation title' });
      }
      conversation.messages.forEach((message) => {
        const matchingAttachment = message.attachments?.find((attachment) => attachment.name.toLowerCase().includes(normalizedSearch));
        if (!message.content.toLowerCase().includes(normalizedSearch) && !matchingAttachment) return;
        const source = message.content.toLowerCase().includes(normalizedSearch)
          ? message.content
          : `Attachment: ${matchingAttachment?.name ?? ''}`;
        results.push({
          conversation,
          messageId: message.id,
          snippet: contextualSnippet(source, normalizedSearch),
          label: message.role === 'user' ? 'You' : 'Assistant',
        });
      });
      return results;
    });
  }, [normalizedSearch, sorted]);

  const newChat = () => {
    setActiveId(null);
    setDraft('');
    setModelMenuOpen(false);
    setAttachmentMenuOpen(false);
    setConversationMenu(null);
    setHeaderMenuOpen(false);
    setFilesPanelOpen(false);
    setPendingAttachments([]);
    setMobileSidebar(false);
    window.setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const chooseConversation = (id: string) => {
    setActiveId(id);
    setModelMenuOpen(false);
    setAttachmentMenuOpen(false);
    setConversationMenu(null);
    setHeaderMenuOpen(false);
    setPendingAttachments([]);
    setMobileSidebar(false);
  };

  const chooseModel = (model: DetectedModel) => {
    setModelMenuOpen(false);
    setPreferredModel({ id: model.id, runtimeId: model.runtimeId });
    if (!active) return;
    const updated = { ...active, modelId: model.id, runtimeId: model.runtimeId, updatedAt: Date.now() };
    updateConversations((current) => current.map((conversation) => conversation.id === active.id ? updated : conversation));
    void window.localRoom.saveConversation(updated);
  };

  const buildTitle = (text: string) => {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > 42 ? `${clean.slice(0, 42).trim()}…` : clean;
  };

  const sendMessage = (text = draft, retryConversation?: Conversation) => {
    const content = text.trim();
    const outgoingAttachments = retryConversation ? [] : pendingAttachments;
    if ((!content && !outgoingAttachments.length) || generating) return;
    if (!selectedModel) {
      setNotice('No local model is available. Start Ollama or LM Studio, then scan again.');
      setSettingsOpen(true);
      return;
    }
    if (outgoingAttachments.some((attachment) => attachment.kind === 'image') && !selectedModel.capabilities.includes('vision')) {
      setNotice(`${selectedModel.name} is a text-only model. Switch to a model marked Vision to send images.`);
      setModelMenuOpen(true);
      return;
    }
    const now = Date.now();
    const base = retryConversation ?? active;
    const effectiveContent = content || (outgoingAttachments.some((attachment) => attachment.kind === 'image') ? 'Describe the attached image.' : 'Review the attached file.');
    const userMessage: ChatMessage = { id: uid(), role: 'user', content: effectiveContent, createdAt: now, attachments: outgoingAttachments };
    const assistantMessage: ChatMessage = { id: uid(), role: 'assistant', content: '', createdAt: now + 1 };
    const conversation: Conversation = base ? {
      ...base,
      modelId: base.modelId || selectedModel.id,
      runtimeId: base.runtimeId || selectedModel.runtimeId,
      messages: retryConversation ? [...base.messages, assistantMessage] : [...base.messages, userMessage, assistantMessage],
      updatedAt: now,
    } : {
      id: uid(), title: buildTitle(content || outgoingAttachments[0]?.name || 'New conversation'), modelId: selectedModel.id, runtimeId: selectedModel.runtimeId,
      messages: [userMessage, assistantMessage], createdAt: now, updatedAt: now,
    };
    const runtime = data.runtimes.find((item) => item.id === conversation.runtimeId);
    if (!runtime) { setNotice('The selected local server is no longer configured.'); return; }
    setActiveId(conversation.id);
    stickToBottomRef.current = true;
    setShowJumpToBottom(false);
    setDraft('');
    setPendingAttachments([]);
    setAttachmentMenuOpen(false);
    updateConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
    void window.localRoom.saveConversation(conversation);

    const requestId = uid();
    const generationState: GenerationState = { requestId, conversationId: conversation.id, startedAt: Date.now() };
    generatingRef.current = generationState;
    setGenerating(generationState);
    const contextMessages: Array<{ role: string; content: string; attachments?: Attachment[] }> = conversation.messages
      .filter((message) => message.content && message.role !== 'system')
      .map(({ role, content: messageContent, attachments }) => ({
        role,
        content: messageContent,
        attachments: selectedModel.capabilities.includes('vision')
          ? attachments
          : attachments?.filter((attachment) => attachment.kind !== 'image'),
      }));
    if (data.settings.systemPrompt.trim()) contextMessages.unshift({ role: 'system', content: data.settings.systemPrompt.trim() });
    if (selectedModel.contextLength) {
      const inputBudget = Math.floor(selectedModel.contextLength * .82);
      const messageTokens = () => estimateTokens(contextMessages.map((message) => `${message.content}${message.attachments?.map((attachment) => attachment.text ?? '').join('') ?? ''}`).join('\n'));
      let trimmed = false;
      while (messageTokens() > inputBudget && contextMessages.filter((message) => message.role !== 'system').length > 2) {
        const removable = contextMessages.findIndex((message) => message.role !== 'system');
        if (removable < 0) break;
        contextMessages.splice(removable, 1);
        trimmed = true;
      }
      if (trimmed) setNotice('The oldest messages were omitted from this request to fit the model context. Your saved chat is unchanged.');
    }
    void window.localRoom.startChat({
      requestId,
      runtime,
      model: conversation.modelId,
      messages: contextMessages,
      temperature: data.settings.temperature,
    });
  };

  const retryLast = () => {
    if (!active || generating) return;
    const messages = [...active.messages];
    if (messages.at(-1)?.role === 'assistant') messages.pop();
    const retryBase = { ...active, messages, updatedAt: Date.now() };
    sendMessage(messages.at(-1)?.content ?? '', retryBase);
  };

  const submitMessageEdit = (mode: 'replace' | 'branch') => {
    if (!active || !editingMessage || generating) return;
    const content = editingMessage.value.trim();
    const index = active.messages.findIndex((message) => message.id === editingMessage.id && message.role === 'user');
    if (!content || index < 0) return;
    const now = Date.now();
    const original = active.messages[index];
    const messages = [...active.messages.slice(0, index), { ...original, content, createdAt: now }];
    const base: Conversation = mode === 'branch' ? {
      ...active,
      id: uid(),
      title: buildTitle(content),
      messages,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    } : {
      ...active,
      title: index === 0 ? buildTitle(content) : active.title,
      messages,
      updatedAt: now,
    };
    setEditingMessage(null);
    sendMessage(content, base);
  };

  const exportActiveChat = async (conversation: Conversation) => {
    setHeaderMenuOpen(false);
    try {
      if (await window.localRoom.exportConversation(conversation)) setNotice('Conversation exported as Markdown.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The conversation could not be exported.');
    }
  };

  const exportBackup = async () => {
    try {
      if (await window.localRoom.exportBackup()) setNotice('Local Room backup created.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The backup could not be created.');
    }
  };

  const importBackup = async () => {
    try {
      const result = await window.localRoom.importBackup();
      if (!result) return;
      conversationsRef.current = result.conversations;
      setData((current) => ({ ...current, conversations: result.conversations }));
      setNotice(`Restored ${result.imported} conversation${result.imported === 1 ? '' : 's'}. Existing newer chats were preserved.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The backup could not be restored.');
    }
  };

  const stopGeneration = () => {
    const currentRequest = generatingRef.current;
    if (!currentRequest) return;
    window.localRoom.stopChat(currentRequest.requestId);
    generatingRef.current = null;
    setGenerating(null);
    updateConversations((current) => current.map((conversation) => {
      if (conversation.id !== currentRequest.conversationId) return conversation;
      const messages = [...conversation.messages];
      if (messages.at(-1)?.role === 'assistant' && !messages.at(-1)?.content.trim()) messages.pop();
      return { ...conversation, messages, updatedAt: Date.now() };
    }));
    const conversation = conversationsRef.current.find((item) => item.id === currentRequest.conversationId);
    if (conversation) void window.localRoom.saveConversation(conversation);
  };

  const deleteChat = async (id: string) => {
    if (generatingRef.current?.conversationId === id) stopGeneration();
    updateConversations((current) => current.filter((conversation) => conversation.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setFilesPanelOpen(false);
    }
    setConfirmDelete(null);
    setConversationMenu(null);
    setHeaderMenuOpen(false);
    await window.localRoom.deleteConversation(id);
  };

  const togglePin = async (id: string) => {
    const conversation = conversationsRef.current.find((item) => item.id === id);
    if (!conversation) return;
    const updated = { ...conversation, pinned: !conversation.pinned };
    updateConversations((current) => current.map((item) => item.id === id ? updated : item));
    setConversationMenu(null);
    setHeaderMenuOpen(false);
    await window.localRoom.saveConversation(updated);
  };

  const shareChat = async (conversation: Conversation) => {
    const transcript = [`# ${conversation.title}`, '', ...conversation.messages.flatMap((message) => [
      `## ${message.role === 'user' ? 'You' : 'Assistant'}`,
      message.attachments?.length ? `Attachments: ${message.attachments.map((attachment) => attachment.name).join(', ')}` : '',
      message.content,
      '',
    ]).filter(Boolean)].join('\n');
    try {
      await navigator.clipboard.writeText(transcript);
      setNotice('Conversation copied. You can paste it anywhere.');
    } catch {
      setNotice('Windows blocked clipboard access. Please try again.');
    }
    setConversationMenu(null);
    setHeaderMenuOpen(false);
  };

  const expandSidebar = (focusSearch = false) => {
    const settings = { ...data.settings, sidebarCollapsed: false };
    setData((current) => ({ ...current, settings }));
    void window.localRoom.saveSettings(settings);
    if (focusSearch) window.setTimeout(() => searchInputRef.current?.focus(), 80);
  };

  const handleChatScroll = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 96;
    stickToBottomRef.current = nearBottom;
    setShowJumpToBottom(!nearBottom);
  };

  const beginPanelResize = (kind: 'sidebar' | 'files', event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeRef.current = {
      kind,
      startX: event.clientX,
      startWidth: kind === 'sidebar' ? sidebarWidth : filesPanelWidth,
    };
    document.body.classList.add('resizing-panels');
  };

  const jumpToBottom = () => {
    const scroller = scrollRef.current;
    stickToBottomRef.current = true;
    setShowJumpToBottom(false);
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
  };

  const openFilesPanel = (conversation: Conversation) => {
    setActiveId(conversation.id);
    setFilesPanelOpen(true);
    setConversationMenu(null);
    setHeaderMenuOpen(false);
  };

  const revealMessage = (messageId: string, delay: number) => {
    stickToBottomRef.current = false;
    window.setTimeout(() => {
      const message = document.getElementById(`message-${messageId}`);
      if (!message) return;
      message.scrollIntoView({ behavior: 'smooth', block: 'center' });
      message.classList.remove('message--located');
      void message.offsetWidth;
      message.classList.add('message--located');
      window.setTimeout(() => message.classList.remove('message--located'), 1700);
    }, delay);
  };

  const jumpToAttachedMessage = (messageId: string) => {
    setFilesPanelOpen(false);
    revealMessage(messageId, 260);
  };

  const jumpToSearchResult = (conversationId: string, messageId?: string) => {
    chooseConversation(conversationId);
    setFilesPanelOpen(false);
    if (messageId) {
      revealMessage(messageId, 90);
      return;
    }
    stickToBottomRef.current = false;
    window.setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 80);
  };

  const renameChat = async () => {
    if (!renaming) return;
    const title = renaming.value.replace(/\s+/g, ' ').trim();
    if (!title) return;
    const conversation = conversationsRef.current.find((item) => item.id === renaming.id);
    if (!conversation) { setRenaming(null); return; }
    const updated = { ...conversation, title, updatedAt: Date.now() };
    updateConversations((current) => current.map((item) => item.id === updated.id ? updated : item));
    setRenaming(null);
    await window.localRoom.saveConversation(updated);
  };

  const saveSettings = async (settings: AppSettings, runtimes: RuntimeConfig[]) => {
    setData((current) => ({ ...current, settings, runtimes }));
    await Promise.all([window.localRoom.saveSettings(settings), window.localRoom.saveRuntimes(runtimes)]);
    setSettingsOpen(false);
    await scanModels(runtimes);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const handlePaste = async (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
    if (!images.length) return;
    event.preventDefault();
    if (selectedModel && !selectedModel.capabilities.includes('vision')) {
      setNotice(`${selectedModel.name} cannot read pasted images. Choose a model marked Vision first.`);
      setModelMenuOpen(true);
      return;
    }
    const remaining = Math.max(0, 4 - pendingAttachments.length);
    if (!remaining) {
      setNotice('You can attach up to four items to one message.');
      return;
    }
    const accepted = images.filter((file) => file.size <= 8 * 1024 * 1024).slice(0, remaining);
    if (accepted.length < images.length) {
      setNotice('Some pasted images were skipped because of the four-item or 8 MB limit.');
    }
    try {
      const attachments = await Promise.all(accepted.map(async (file, index) => {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error ?? new Error('The pasted image could not be read.'));
          reader.readAsDataURL(file);
        });
        const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
        return {
          id: uid(),
          name: file.name && file.name !== 'image.png'
            ? file.name
            : `Pasted image ${pendingAttachments.length + index + 1}.${extension}`,
          kind: 'image' as const,
          mimeType: file.type || 'image/png',
          size: file.size,
          dataUrl,
        };
      }));
      setPendingAttachments((current) => [...current, ...attachments].slice(0, 4));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The pasted image could not be added.');
    }
  };

  const attach = async (kind: 'image' | 'file') => {
    setAttachmentMenuOpen(false);
    if (kind === 'image' && selectedModel && !selectedModel.capabilities.includes('vision')) {
      setNotice(`${selectedModel.name} cannot read images. Choose a model marked Vision first.`);
      setModelMenuOpen(true);
      return;
    }
    try {
      const picked = await window.localRoom.pickAttachments(kind);
      setPendingAttachments((current) => {
        const remaining = Math.max(0, 4 - current.length);
        if (picked.length > remaining) setNotice('You can attach up to four items to one message.');
        return [...current, ...picked.slice(0, remaining)];
      });
      window.setTimeout(() => textareaRef.current?.focus(), 30);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The attachment could not be added.');
    }
  };

  const starterPrompts = [
    { icon: '✦', title: 'Brainstorm with me', text: 'Help me brainstorm ideas for a small weekend project' },
    { icon: '</>', title: 'Build something', text: 'Write a clean Python script that organizes a folder by file type' },
    { icon: '◎', title: 'Explain a topic', text: 'Explain a complex topic to me using a simple analogy' },
  ];

  if (!loaded) return <div className="loading-screen"><Logo /><p>Preparing your private workspace…</p></div>;

  return (
    <div className={`app-shell ${data.settings.sidebarCollapsed ? 'sidebar-collapsed' : ''}`} style={{
      '--sidebar-width': `${sidebarWidth}px`,
      '--files-panel-width': `${filesPanelWidth}px`,
    } as CSSProperties}>
      <aside className={`sidebar ${mobileSidebar ? 'mobile-open' : ''}`}>
        <div className="brand-row">
          <button className="brand" onClick={newChat}><Logo /><span>Local Room</span></button>
          <button className="icon-button mobile-only" onClick={() => setMobileSidebar(false)}><X size={19} /></button>
          <button className="icon-button desktop-only collapse-button" onClick={() => {
            const settings = { ...data.settings, sidebarCollapsed: true };
            setData((current) => ({ ...current, settings }));
            void window.localRoom.saveSettings(settings);
          }} title="Collapse sidebar"><PanelLeftClose size={18} /></button>
        </div>
        <button className="new-chat-button" onClick={newChat}><Plus size={17} /><span>New conversation</span><kbd>Ctrl N</kbd></button>
        <div className="search-box"><Search size={16} /><input ref={searchInputRef} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setSearch(''); }} placeholder="Search chats and messages" />{search && <button className="search-clear" type="button" onClick={() => { setSearch(''); searchInputRef.current?.focus(); }} aria-label="Clear search" title="Clear search"><X size={14} /></button>}</div>
        <div className="conversation-list">
          {normalizedSearch ? <div className="conversation-group search-results-group">
            <div className="search-results-heading"><p>Search results</p><span>{searchResults.length}</span></div>
            {searchResults.map(({ conversation, messageId, snippet, label }) => <button
              type="button"
              className={`search-result-item ${activeId === conversation.id ? 'active' : ''}`}
              key={`${conversation.id}-${messageId ?? 'title'}`}
              onClick={() => jumpToSearchResult(conversation.id, messageId)}
              title={snippet}
            >
              <MessageSquareText size={15} />
              <span className="search-result-copy">
                <b>{conversation.title}</b>
                <small>{label}</small>
                <span><HighlightedText text={snippet} query={normalizedSearch} /></span>
              </span>
            </button>)}
            {!searchResults.length && <div className="no-results"><Search size={20} /><b>No matches found</b><span>Try a different word or phrase.</span></div>}
          </div> : Object.entries(groups).map(([label, items]) => (
            <div className="conversation-group" key={label}>
              <p>{label}</p>
              {items.map((conversation) => (
                <div className={`conversation-item ${activeId === conversation.id ? 'active' : ''}`} key={conversation.id} role="button" tabIndex={0} onClick={() => chooseConversation(conversation.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') chooseConversation(conversation.id); }}>
                  <MessageSquareText size={15} />
                  <span className="conversation-copy"><b>{conversation.title}</b></span>
                  <span className="item-actions" data-floating-ui onClick={(event) => event.stopPropagation()}>
                    {conversation.pinned && <Pin className="visible-pin" size={13} fill="currentColor" />}
                    <button onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setConversationMenu((current) => current?.id === conversation.id ? null : {
                        id: conversation.id,
                        left: Math.max(8, rect.right - 178),
                        top: Math.min(rect.bottom + 5, window.innerHeight - 282),
                      });
                    }} aria-label="Conversation actions"><MoreHorizontal size={16} /></button>
                  </span>
                  {conversationMenu?.id === conversation.id && <div className="conversation-menu" data-floating-ui style={{ left: conversationMenu.left, top: conversationMenu.top }} onClick={(event) => event.stopPropagation()}>
                    <button onClick={() => void shareChat(conversation)}><Share2 size={16} />Share</button>
                    <button onClick={() => openFilesPanel(conversation)}><Paperclip size={16} />Files in chat</button>
                    <button onClick={() => void exportActiveChat(conversation)}><Download size={16} />Export Markdown</button>
                    <button onClick={() => { setRenaming({ id: conversation.id, value: conversation.title }); setConversationMenu(null); }}><Pencil size={16} />Rename</button>
                    <button onClick={() => void togglePin(conversation.id)}><Pin size={16} />{conversation.pinned ? 'Unpin chat' : 'Pin chat'}</button>
                    <span className="menu-divider" />
                    <button className="danger" onClick={() => { setConfirmDelete(conversation.id); setConversationMenu(null); }}><Trash2 size={16} />Delete</button>
                  </div>}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <button onClick={() => setSettingsOpen(true)}><Settings size={17} /><span>Settings</span></button>
          <div className="local-status"><span className={models.length ? 'online' : ''} />{models.length ? `${models.length} local model${models.length === 1 ? '' : 's'} ready` : 'No model detected'}</div>
          <CreatorCredit />
        </div>
        <div className="panel-resize-handle sidebar-resize-handle" role="separator" aria-orientation="vertical" aria-label="Resize conversation sidebar" onPointerDown={(event) => beginPanelResize('sidebar', event)} />
      </aside>

      <div className="sidebar-rail">
        <button className="rail-brand" onClick={() => expandSidebar()} title="Open sidebar"><Logo small /></button>
        <button onClick={newChat} title="New chat"><Pencil size={18} /></button>
        <button onClick={() => expandSidebar(true)} title="Search chats"><Search size={18} /></button>
        <button onClick={() => expandSidebar()} title="Pinned chats"><Pin size={18} /></button>
        <button onClick={() => expandSidebar()} title="All chats"><MessageSquareText size={18} /></button>
        <div className="rail-spacer" />
        <CreatorCredit compact />
        <button onClick={() => setSettingsOpen(true)} title="Settings"><Settings size={18} /></button>
      </div>

      <main className={`main-panel ${filesPanelOpen ? 'files-open' : ''}`}>
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileSidebar(true)}><Menu size={20} /></button>
          <div className="chat-title">
            <span>{active?.title ?? 'New conversation'}</span>
            {active && <small>Saved locally</small>}
          </div>
          <div />
          <div className="topbar-actions">
            {active?.pinned && <Pin className="header-pin" size={15} fill="currentColor" />}
            {active ? <div className="header-menu-wrap" data-floating-ui>
              <button className="icon-button" onClick={() => setHeaderMenuOpen((value) => !value)} title="Chat options"><MoreHorizontal size={20} /></button>
              {headerMenuOpen && <div className="conversation-menu header-menu" data-floating-ui>
                <button onClick={() => void shareChat(active)}><Share2 size={16} />Share</button>
                <button onClick={() => openFilesPanel(active)}><Paperclip size={16} />Files in chat{chatFiles.length > 0 ? ` (${chatFiles.length})` : ''}</button>
                <button onClick={() => void exportActiveChat(active)}><Download size={16} />Export Markdown</button>
                <button onClick={() => { setRenaming({ id: active.id, value: active.title }); setHeaderMenuOpen(false); }}><Pencil size={16} />Rename</button>
                <button onClick={() => void togglePin(active.id)}><Pin size={16} />{active.pinned ? 'Unpin chat' : 'Pin chat'}</button>
                <span className="menu-divider" />
                <button className="danger" onClick={() => { setConfirmDelete(active.id); setHeaderMenuOpen(false); }}><Trash2 size={16} />Delete</button>
              </div>}
            </div> : <button className="icon-button" onClick={() => setSettingsOpen(true)} title="Settings"><Settings size={18} /></button>}
          </div>
        </header>

        <div className="chat-scroll" ref={scrollRef} onScroll={handleChatScroll}>
          {!active || !active.messages.length ? (
            <section className="welcome">
              <h1>What can I help with?</h1>
              <p className="welcome-copy">Choose a local model and start a conversation.</p>
              <div className="starter-pills">
                {starterPrompts.map((prompt) => <button key={prompt.title} onClick={() => { setDraft(prompt.text); textareaRef.current?.focus(); }}><span>{prompt.icon}</span>{prompt.title}</button>)}
              </div>
            </section>
          ) : (
            <div className="messages-wrap">
              {active.messages.map((message, index) => <MessageBubble
                key={message.id}
                message={message}
                streaming={Boolean(generating?.conversationId === active.id && index === active.messages.length - 1)}
                onRetry={message.role === 'assistant' && index === active.messages.length - 1 ? retryLast : undefined}
                onEdit={message.role === 'user' && !generating ? () => setEditingMessage({ id: message.id, value: message.content }) : undefined}
                onBranch={message.role === 'user' && !generating && index < active.messages.length - 1 ? () => setEditingMessage({ id: message.id, value: message.content }) : undefined}
              />)}
            </div>
          )}
        </div>

        {showJumpToBottom && <button className={`jump-to-bottom ${generating ? 'generating' : ''}`} onClick={jumpToBottom} title="Jump to latest message" aria-label="Jump to latest message"><ArrowDown size={17} /></button>}

        <div className="composer-area">
          <form className="composer" onSubmit={(event: FormEvent) => { event.preventDefault(); sendMessage(); }}>
            {pendingAttachments.length > 0 && <div className="pending-attachments">
              {pendingAttachments.map((attachment) => <div className={`pending-attachment ${attachment.kind}`} key={attachment.id}>
                {attachment.kind === 'image' && attachment.dataUrl ? <img src={attachment.dataUrl} alt="" /> : <span className="file-preview"><FileText size={18} /></span>}
                <span><b>{attachment.name}</b><small>{attachment.kind === 'image' ? 'Image' : 'Text file'} · {attachment.size > 1024 * 1024 ? `${(attachment.size / 1024 / 1024).toFixed(1)} MB` : `${(attachment.size / 1024).toFixed(1)} KB`}</small></span>
                <button type="button" onClick={() => setPendingAttachments((current) => current.filter((item) => item.id !== attachment.id))} aria-label={`Remove ${attachment.name}`}><X size={13} /></button>
              </div>)}
            </div>}
            <textarea ref={textareaRef} value={draft} onChange={(event) => setDraft(event.target.value)} onFocus={() => { setModelMenuOpen(false); setAttachmentMenuOpen(false); }} onKeyDown={handleKeyDown} onPaste={(event) => void handlePaste(event)} placeholder={selectedModel ? `Message ${selectedModel.name}…` : 'Connect a local model to begin…'} rows={1} disabled={Boolean(generating)} />
            <div className="composer-bottom">
              <div className="composer-tools">
                <div className="attachment-wrap" data-floating-ui>
                  <button type="button" className={`attachment-button ${attachmentMenuOpen ? 'active' : ''}`} onClick={() => { setAttachmentMenuOpen((value) => !value); setModelMenuOpen(false); }} title="Add photos or files"><Plus size={18} /></button>
                  {attachmentMenuOpen && <div className="attachment-menu">
                    <button type="button" className={selectedModel && !selectedModel.capabilities.includes('vision') ? 'limited' : ''} onClick={() => void attach('image')}><span><ImageIcon size={17} /></span><span><b>Add photos</b><small>{selectedModel?.capabilities.includes('vision') ? 'PNG, JPEG or WebP' : 'Requires a Vision model'}</small></span></button>
                    <button type="button" onClick={() => void attach('file')}><span><FileText size={17} /></span><span><b>Add files</b><small>Text, code, CSV or JSON</small></span></button>
                  </div>}
                </div>
                <div className="model-picker-wrap composer-model-wrap" data-floating-ui>
                  <button type="button" className="composer-model-button" onClick={() => { setModelMenuOpen((value) => !value); setAttachmentMenuOpen(false); }}>
                    <span className={`model-dot ${selectedModel ? 'online' : ''}`} />
                    <span>{selectedModel?.name ?? 'Choose model'}</span>
                    <ChevronDown size={13} />
                  </button>
                  {modelMenuOpen && (
                    <div className="model-menu">
                      <div className="model-menu-head"><span>Switch model</span><button type="button" onClick={() => void scanModels()}><RefreshCwIcon spinning={scanning} /></button></div>
                      {models.map((model) => (
                        <button type="button" key={`${model.runtimeId}-${model.id}`} className={selectedModel?.id === model.id && selectedModel.runtimeId === model.runtimeId ? 'selected' : ''} onClick={() => chooseModel(model)}>
                          <span className="model-logo">{model.capabilities.includes('vision') ? <Eye size={17} /> : <Bot size={17} />}</span><span><b>{model.name}</b><small>{model.runtimeName}{model.size ? ` · ${formatSize(model.size)}` : ''}{model.capabilities.includes('vision') ? ' · Vision' : ''}</small></span>{selectedModel?.id === model.id && selectedModel.runtimeId === model.runtimeId && <span className="checkmark">✓</span>}
                        </button>
                      ))}
                      {!models.length && <div className="empty-models"><WifiOff size={19} /><span>No running models found</span><button type="button" onClick={() => { setModelMenuOpen(false); setSettingsOpen(true); }}>Open settings</button></div>}
                    </div>
                  )}
                </div>
                <button type="button" className="composer-tool-icon" onClick={() => setSettingsOpen(true)} title={selectedModel ? 'Private local connection' : 'Configure a local model'}>
                  {selectedModel ? <ShieldCheck size={16} /> : <WifiOff size={16} />}
                </button>
              </div>
              {generating ? <button type="button" className="send-button stop" onClick={stopGeneration} title="Stop generating"><Square size={14} fill="currentColor" /></button> : <button className="send-button" disabled={(!draft.trim() && !pendingAttachments.length) || !selectedModel} title="Send message"><Send size={17} /></button>}
            </div>
          </form>
          <div className="composer-meta">
            <p className="composer-note">Local models can make mistakes. Verify important information. <span>Shift + Enter for a new line</span></p>
            <div className={`context-meter ${contextPercent >= 80 ? 'warning' : ''}`} title={contextLimit ? `${contextTokens.toLocaleString()} estimated tokens of ${contextLimit.toLocaleString()}` : 'Estimated context usage; this model did not report its limit'}>
              <span>Context ~{formatTokenCount(contextTokens)}{contextLimit ? ` / ${formatTokenCount(contextLimit)}` : ''}</span>
              {contextLimit && <i><b style={{ width: `${Math.max(2, contextPercent)}%` }} /></i>}
            </div>
          </div>
        </div>

        {filesPanelOpen && <aside className="chat-files-panel" aria-label="Files in chat">
          <div className="panel-resize-handle files-resize-handle" role="separator" aria-orientation="vertical" aria-label="Resize files panel" onPointerDown={(event) => beginPanelResize('files', event)} />
          <header><div><h2>Files in chat</h2><p>{active ? active.title : 'No conversation selected'}</p></div><button className="icon-button" onClick={() => setFilesPanelOpen(false)} aria-label="Close files panel"><X size={19} /></button></header>
          <div className="files-panel-body">
            {chatFiles.length ? <>
              <div className="files-count"><span>{chatFiles.length} referenced item{chatFiles.length === 1 ? '' : 's'}</span><small>Stored locally with this conversation</small></div>
              <div className="chat-file-list">{chatFiles.map(({ attachment, messageId, createdAt }) => <button type="button" className="chat-file-card" key={`${messageId}-${attachment.id}`} onClick={() => jumpToAttachedMessage(messageId)} title="Jump to this attachment in the conversation">
                <div className={`chat-file-preview ${attachment.kind}`}>
                  {attachment.kind === 'image' && attachment.dataUrl ? <img src={attachment.dataUrl} alt={attachment.name} /> : <FileText size={21} />}
                </div>
                <div className="chat-file-copy"><b title={attachment.name}>{attachment.name}</b><span>{attachment.kind === 'image' ? 'Image' : 'Text file'} · {formatAttachmentSize(attachment.size)}</span><small>{new Date(createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</small></div>
                <span className="chat-file-open"><ArrowDown size={14} /></span>
              </button>)}</div>
            </> : <div className="files-empty"><span><Paperclip size={22} /></span><h3>No files referenced yet</h3><p>Images and files sent in this conversation will appear here.</p></div>}
          </div>
        </aside>}
      </main>

      <SettingsPanel open={settingsOpen} settings={data.settings} runtimes={data.runtimes} models={models} scanning={scanning} onClose={() => setSettingsOpen(false)} onScan={(runtimes) => void scanModels(runtimes)} onSave={(settings, runtimes) => void saveSettings(settings, runtimes)} onExportBackup={() => void exportBackup()} onImportBackup={() => void importBackup()} />

      {confirmDelete && <div className="confirm-popover"><div className="confirm-icon"><Trash2 size={19} /></div><div><b>Delete this conversation?</b><p>This removes its messages from this device.</p></div><div className="confirm-actions"><button onClick={() => setConfirmDelete(null)}>Cancel</button><button className="danger" onClick={() => void deleteChat(confirmDelete)}>Delete</button></div></div>}
      {renaming && <div className="modal-backdrop compact-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setRenaming(null)}>
        <form className="rename-dialog" onSubmit={(event) => { event.preventDefault(); void renameChat(); }}>
          <div className="rename-dialog-head"><div><h3>Rename conversation</h3><p>Choose a clear title for this chat.</p></div><button type="button" className="icon-button" onClick={() => setRenaming(null)}><X size={18} /></button></div>
          <input autoFocus maxLength={80} value={renaming.value} onChange={(event) => setRenaming({ ...renaming, value: event.target.value })} onFocus={(event) => event.currentTarget.select()} />
          <div className="rename-actions"><button type="button" onClick={() => setRenaming(null)}>Cancel</button><button type="submit" disabled={!renaming.value.trim()}>Save</button></div>
        </form>
      </div>}
      {editingMessage && <div className="modal-backdrop compact-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setEditingMessage(null)}>
        <form className="message-edit-dialog" onSubmit={(event) => { event.preventDefault(); submitMessageEdit('replace'); }}>
          <div className="rename-dialog-head"><div><h3>Edit message</h3><p>Regenerate this conversation or create a separate branch from here.</p></div><button type="button" className="icon-button" onClick={() => setEditingMessage(null)}><X size={18} /></button></div>
          <textarea autoFocus rows={6} value={editingMessage.value} onChange={(event) => setEditingMessage({ ...editingMessage, value: event.target.value })} />
          <div className="edit-message-actions"><button type="button" onClick={() => setEditingMessage(null)}>Cancel</button><button type="button" onClick={() => submitMessageEdit('branch')} disabled={!editingMessage.value.trim()}>Branch as new chat</button><button className="primary-edit" type="submit" disabled={!editingMessage.value.trim()}>Save & regenerate</button></div>
        </form>
      </div>}
      {notice && <div className="toast"><CircleHelp size={18} /><span>{notice}</span><button onClick={() => setNotice(null)}><X size={16} /></button></div>}
      {mobileSidebar && <div className="mobile-scrim" onClick={() => setMobileSidebar(false)} />}
    </div>
  );
}

function RefreshCwIcon({ spinning }: { spinning: boolean }) {
  return <span className={spinning ? 'refresh-glyph spin' : 'refresh-glyph'}>↻</span>;
}

export default App;
