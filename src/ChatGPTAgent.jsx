import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Bot,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Folder,
  Loader2,
  Menu,
  PanelLeft,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  Save,
  Square,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || (() => {
  const { protocol, hostname, port } = window.location;
  if (protocol !== 'http:' && protocol !== 'https:') return 'http://localhost:5188';
  if (port === '5173' || port === '4173' || port === '3000') return `${protocol}//${hostname}:5188`;
  return window.location.origin;
})();

const STORAGE_KEYS = {
  chats: 'ollama-agent-chats',
  activeChatId: 'ollama-agent-active-chat-id',
  model: 'ollama-agent-selected-model',
  sidebar: 'ollama-agent-sidebar-open',
  controls: 'ollama-agent-controls',
};

const EMPTY_CHAT_TITLE = 'New chat';
const DEFAULT_CONTROLS = {
  systemPrompt: 'You are my private offline coding and file assistant. Stay local, be direct, and help me create code, scripts, and files I can use on my own computer.',
  temperature: 0.4,
  topP: 0.9,
  topK: 40,
  numPredict: 1024,
  numCtx: 8192,
  repeatPenalty: 1.1,
  seed: '',
  keepAlive: '10m',
  offlineOnly: true,
};
const PROMPTS = [
  {
    label: 'Scaffold a web app',
    prompt: 'Create a clean React and CSS starter for a local offline app with a chat panel and a file editor.',
  },
  {
    label: 'Build a Node tool',
    prompt: 'Generate a Node.js script that reads a folder, summarizes files, and writes a report locally.',
  },
  {
    label: 'Debug my code',
    prompt: 'Help me debug this code and explain the fix clearly. Keep the solution local and practical.',
  },
  {
    label: 'Make a project plan',
    prompt: 'Turn my idea into a concise implementation plan with files I should create next.',
  },
];

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadControls() {
  const stored = loadJSON(STORAGE_KEYS.controls, null);
  return {
    ...DEFAULT_CONTROLS,
    ...(stored && typeof stored === 'object' ? stored : {}),
  };
}

function createId(prefix) {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

function createChat() {
  const now = new Date().toISOString();
  return {
    id: createId('chat'),
    title: EMPTY_CHAT_TITLE,
    model: '',
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

function normalizeChats(value) {
  if (!Array.isArray(value)) return [createChat()];
  const chats = value
    .map((chat) => ({
      id: chat?.id || createId('chat'),
      title: chat?.title || EMPTY_CHAT_TITLE,
      model: chat?.model || '',
      createdAt: chat?.createdAt || new Date().toISOString(),
      updatedAt: chat?.updatedAt || chat?.createdAt || new Date().toISOString(),
      messages: Array.isArray(chat?.messages)
        ? chat.messages.map((message) => ({
            id: message?.id || createId('msg'),
            role: message?.role === 'assistant' ? 'assistant' : 'user',
            content: String(message?.content || ''),
            createdAt: message?.createdAt || new Date().toISOString(),
            isStreaming: Boolean(message?.isStreaming),
          }))
        : [],
    }))
    .filter(Boolean);

  return chats.length ? chats : [createChat()];
}

function shortTitle(text) {
  const words = String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean);
  if (!words.length) return EMPTY_CHAT_TITLE;
  return words.slice(0, 6).join(' ').replace(/[.,!?]+$/g, '');
}

function prettyTime(value) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

function prettyDate(value) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

function messagePreview(message) {
  return String(message?.content || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 84);
}

function normalizeNumber(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function flattenWorkspaceTree(items = [], depth = 0) {
  return items.flatMap((item) => {
    const current = { ...item, depth };
    if (item.type === 'directory') {
      return [current, ...flattenWorkspaceTree(item.children || [], depth + 1)];
    }
    return [current];
  });
}

function markdownComponents() {
  return {
    code({ inline, className, children, ...props }) {
      return inline ? (
        <code className="md-inline-code" {...props}>
          {children}
        </code>
      ) : (
        <pre className="md-code-block">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      );
    },
    a({ children, ...props }) {
      return (
        <a target="_blank" rel="noreferrer" {...props}>
          {children}
        </a>
      );
    },
    blockquote({ children, ...props }) {
      return (
        <blockquote className="md-blockquote" {...props}>
          {children}
        </blockquote>
      );
    },
    table({ children, ...props }) {
      return (
        <div className="md-table-wrap">
          <table {...props}>{children}</table>
        </div>
      );
    },
  };
}

export default function ChatGPTAgent() {
  const [chats, setChats] = useState(() => normalizeChats(loadJSON(STORAGE_KEYS.chats, null)));
  const [activeChatId, setActiveChatId] = useState(() => localStorage.getItem(STORAGE_KEYS.activeChatId) || '');
  const [draft, setDraft] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.sidebar);
    if (stored === null) return window.innerWidth >= 960;
    return stored === 'true';
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem(STORAGE_KEYS.model) || '');
  const [controls, setControls] = useState(() => loadControls());
  const [models, setModels] = useState([]);
  const [workspaceItems, setWorkspaceItems] = useState([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [selectedFilePath, setSelectedFilePath] = useState('');
  const [fileDraft, setFileDraft] = useState('');
  const [newFilePath, setNewFilePath] = useState('notes/hello.js');
  const [newFolderPath, setNewFolderPath] = useState('notes');
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [status, setStatus] = useState('Connect to a local Ollama model to start chatting.');
  const [isSending, setIsSending] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState('');
  const abortRef = useRef(null);
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const currentChat = useMemo(() => chats.find((chat) => chat.id === activeChatId) || chats[0], [chats, activeChatId]);
  const activeModel = currentChat?.model || selectedModel || models[0]?.name || '';
  const flatWorkspaceItems = useMemo(() => flattenWorkspaceTree(workspaceItems), [workspaceItems]);
  const requestOptions = useMemo(() => {
    const next = {
      temperature: normalizeNumber(controls.temperature, DEFAULT_CONTROLS.temperature),
      top_p: normalizeNumber(controls.topP, DEFAULT_CONTROLS.topP),
      top_k: normalizeNumber(controls.topK, DEFAULT_CONTROLS.topK),
      num_predict: normalizeNumber(controls.numPredict, DEFAULT_CONTROLS.numPredict),
      num_ctx: normalizeNumber(controls.numCtx, DEFAULT_CONTROLS.numCtx),
      repeat_penalty: normalizeNumber(controls.repeatPenalty, DEFAULT_CONTROLS.repeatPenalty),
      keep_alive: String(controls.keepAlive || DEFAULT_CONTROLS.keepAlive).trim(),
    };
    if (String(controls.seed || '').trim() !== '') {
      next.seed = normalizeNumber(controls.seed, 0);
    }
    return next;
  }, [controls]);
  const systemPrompt = String(controls.systemPrompt || '').trim();

  useEffect(() => {
    saveJSON(STORAGE_KEYS.chats, chats);
  }, [chats]);

  useEffect(() => {
    if (activeChatId) localStorage.setItem(STORAGE_KEYS.activeChatId, activeChatId);
  }, [activeChatId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.sidebar, String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    if (selectedModel) localStorage.setItem(STORAGE_KEYS.model, selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    saveJSON(STORAGE_KEYS.controls, controls);
  }, [controls]);

  const refreshWorkspace = async () => {
    setWorkspaceLoading(true);
    setWorkspaceError('');
    try {
      const response = await fetch(`${API_BASE}/api/workspace`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.error || 'Could not load workspace.');
      setWorkspaceItems(Array.isArray(data.items) ? data.items : []);
      setStatus('Workspace loaded.');
    } catch (error) {
      setWorkspaceError(error.message || 'Workspace unavailable.');
      setStatus('Workspace could not be loaded.');
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const openWorkspaceFile = async (workspacePath) => {
    if (!workspacePath) return;
    setWorkspaceError('');
    try {
      const response = await fetch(`${API_BASE}/api/workspace/file?path=${encodeURIComponent(workspacePath)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.error || 'Could not open file.');
      setSelectedFilePath(data.path);
      setFileDraft(data.content || '');
      setStatus(`Opened ${data.path}.`);
      setSettingsOpen(false);
    } catch (error) {
      setWorkspaceError(error.message || 'Could not open file.');
    }
  };

  const saveWorkspaceFile = async (workspacePath = selectedFilePath, content = fileDraft) => {
    const nextPath = String(workspacePath || '').trim();
    if (!nextPath) {
      setWorkspaceError('Choose or enter a file path first.');
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/api/workspace/file`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: nextPath, content }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.error || 'Could not save file.');
      setSelectedFilePath(data.path);
      setFileDraft(content);
      setStatus(`Saved ${data.path}.`);
      await refreshWorkspace();
    } catch (error) {
      setWorkspaceError(error.message || 'Could not save file.');
    }
  };

  const createWorkspaceFile = async () => {
    const pathValue = String(newFilePath || '').trim();
    if (!pathValue) {
      setWorkspaceError('Enter a file path first.');
      return;
    }
    await saveWorkspaceFile(pathValue, fileDraft || '');
    setSelectedFilePath(pathValue);
  };

  const createWorkspaceFolder = async () => {
    const pathValue = String(newFolderPath || '').trim();
    if (!pathValue) {
      setWorkspaceError('Enter a folder path first.');
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/api/workspace/folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathValue }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.error || 'Could not create folder.');
      setStatus(`Created folder ${data.path}.`);
      await refreshWorkspace();
    } catch (error) {
      setWorkspaceError(error.message || 'Could not create folder.');
    }
  };

  useEffect(() => {
    if (currentChat?.id && activeChatId !== currentChat.id) {
      setActiveChatId(currentChat.id);
    }
  }, [activeChatId, currentChat]);

  useEffect(() => {
    const loadModels = async () => {
      setModelsLoading(true);
      setModelsError('');
      try {
        const response = await fetch(`${API_BASE}/api/ollama/models`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || data.error || 'Unable to reach Ollama.');
        const nextModels = Array.isArray(data.models) ? data.models : [];
        setModels(nextModels);
        if (nextModels.length) {
          const nextSelected = nextModels.some((model) => model.name === selectedModel)
            ? selectedModel
            : nextModels[0].name;
          setSelectedModel(nextSelected);
          setStatus(`Ready with ${nextSelected}. Use a preset or open a file to get moving.`);
          setChats((previous) => previous.map((chat) => (
            chat.id === activeChatId && !chat.model
              ? { ...chat, model: nextSelected, updatedAt: new Date().toISOString() }
              : chat
          )));
        } else {
          setStatus('No local Ollama models were found.');
        }
      } catch (error) {
        setModelsError(error.message || 'Failed to load local models.');
        setStatus('Ollama is unavailable. Start it at http://localhost:11434 and refresh.');
      } finally {
        setModelsLoading(false);
      }
    };

    loadModels();
    return () => abortRef.current?.abort?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refreshWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 960) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: isSending ? 'smooth' : 'auto', block: 'end' });
  }, [chats, activeChatId, isSending]);

  useEffect(() => {
    if (inputRef.current) inputRef.current.style.height = 'auto';
    if (inputRef.current) inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
  }, [draft]);

  const syncChat = (chatId, updater) => {
    setChats((previous) => previous.map((chat) => (chat.id === chatId ? updater(chat) : chat)));
  };

  const createAndActivateChat = () => {
    const chat = createChat();
    setChats((previous) => [chat, ...previous]);
    setActiveChatId(chat.id);
    setStatus('New chat ready.');
    setSettingsOpen(false);
    setDraft('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const selectChat = (chatId) => {
    const chat = chats.find((item) => item.id === chatId);
    if (!chat) return;
    setActiveChatId(chatId);
    setSelectedModel(chat.model || selectedModel || models[0]?.name || '');
    setSidebarOpen(window.innerWidth >= 960);
    setStatus(`Opened "${chat.title}".`);
  };

  const deleteChat = (chatId) => {
    setChats((previous) => {
      const remaining = previous.filter((chat) => chat.id !== chatId);
      if (!remaining.length) {
        const chat = createChat();
        setActiveChatId(chat.id);
        return [chat];
      }
      if (activeChatId === chatId) {
        setActiveChatId(remaining[0].id);
      }
      return remaining;
    });
  };

  const updateCurrentChatModel = (nextModel) => {
    setSelectedModel(nextModel);
    if (!currentChat) return;
    syncChat(currentChat.id, (chat) => ({
      ...chat,
      model: nextModel,
      updatedAt: new Date().toISOString(),
    }));
  };

  const copyMessage = async (message) => {
    try {
      await navigator.clipboard.writeText(String(message?.content || ''));
      setCopiedMessageId(message.id);
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === message.id ? '' : current));
      }, 1200);
    } catch {
      setStatus('Copy failed. Your browser blocked clipboard access.');
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort?.();
  };

  const appendAssistantDelta = (chatId, assistantId, delta) => {
    if (!delta) return;
    syncChat(chatId, (chat) => ({
      ...chat,
      updatedAt: new Date().toISOString(),
      messages: chat.messages.map((message) => (
        message.id === assistantId
          ? { ...message, content: `${message.content || ''}${delta}`, isStreaming: true }
          : message
      )),
    }));
  };

  const finalizeAssistant = (chatId, assistantId, { aborted = false } = {}) => {
    syncChat(chatId, (chat) => ({
      ...chat,
      updatedAt: new Date().toISOString(),
      messages: chat.messages.map((message) => {
        if (message.id !== assistantId) return message;
        const nextContent = message.content || (aborted ? 'Generation stopped.' : 'No response received.');
        return {
          ...message,
          content: nextContent,
          isStreaming: false,
        };
      }),
    }));
  };

  const sendMessage = async (messageText = draft) => {
    const content = String(messageText || '').trim();
    if (!content || isSending) return;

    const chat = currentChat || createChat();
    if (!currentChat) {
      setChats((previous) => [chat, ...previous]);
      setActiveChatId(chat.id);
    }

    const chatId = chat.id;
    const modelName = selectedModel || chat.model || models[0]?.name || '';
    const createdAt = new Date().toISOString();
    const userMessage = {
      id: createId('msg'),
      role: 'user',
      content,
      createdAt,
    };
    const assistantId = createId('msg');
    const assistantMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt,
      isStreaming: true,
    };

    setDraft('');
    setIsSending(true);
    setStatus('Streaming response from Ollama...');
    setSettingsOpen(false);

    const history = [...(chat.messages || []), userMessage].map((message) => ({
      role: message.role,
      content: message.content,
    }));

    syncChat(chatId, (item) => ({
      ...item,
      title: item.title === EMPTY_CHAT_TITLE ? shortTitle(content) : item.title,
      model: modelName || item.model,
      updatedAt: createdAt,
      messages: [...item.messages, userMessage, assistantMessage],
    }));

    const controller = new AbortController();
    abortRef.current = controller;
    let responseText = '';
    let buffer = '';

    try {
      const response = await fetch(`${API_BASE}/api/ollama/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      body: JSON.stringify({
          model: modelName,
          messages: systemPrompt
            ? [{ role: 'system', content: systemPrompt }, ...history]
            : history,
          stream: true,
          options: requestOptions,
        }),
        signal: controller.signal,
      });

      const errorPayload = response.ok ? null : await response.clone().json().catch(() => null);
      if (!response.ok) {
        throw new Error(errorPayload?.detail || errorPayload?.error || `Ollama request failed (${response.status})`);
      }

      if (!response.body) {
        throw new Error('The Ollama response stream was empty.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let payload;
          try {
            payload = JSON.parse(trimmed);
          } catch {
            continue;
          }
          if (payload.error) throw new Error(payload.error);
          const delta = payload.message?.content || payload.response || '';
          if (delta) {
            responseText += delta;
            appendAssistantDelta(chatId, assistantId, delta);
          }
        }
      }

      const leftover = buffer.trim();
      if (leftover) {
        try {
          const payload = JSON.parse(leftover);
          const delta = payload.message?.content || payload.response || '';
          if (delta) {
            responseText += delta;
            appendAssistantDelta(chatId, assistantId, delta);
          }
        } catch {
          // Ignore a trailing partial frame. Ollama usually ends on a newline.
        }
      }

      if (!responseText.trim()) {
        appendAssistantDelta(chatId, assistantId, 'No response received.');
      }
      setStatus(`Response finished with ${modelName || 'the selected model'}.`);
    } catch (error) {
      const aborted = controller.signal.aborted;
      if (!aborted) {
        setStatus(error.message || 'The local Ollama request failed.');
      } else {
        setStatus('Generation stopped.');
      }
      if (!aborted && !responseText) {
        syncChat(chatId, (item) => ({
          ...item,
          updatedAt: new Date().toISOString(),
          messages: item.messages.map((message) => (
            message.id === assistantId
              ? { ...message, content: error.message || 'Something went wrong.', isError: true, isStreaming: false }
              : message
          )),
        }));
      }
    } finally {
      finalizeAssistant(chatId, assistantId, { aborted: controller.signal.aborted });
      setIsSending(false);
      abortRef.current = null;
      setChats((previous) => previous.map((item) => (
        item.id === chatId
          ? {
              ...item,
              updatedAt: new Date().toISOString(),
            }
          : item
      )));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await sendMessage(draft);
  };

  const currentMessages = currentChat?.messages || [];

  return (
    <div className="chat-app-shell">
      <aside className={`chat-sidebar ${sidebarOpen ? 'is-open' : 'is-closed'}`}>
        <div className="sidebar-top">
          <button type="button" className="ghost-icon-btn" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
            <X size={18} />
          </button>
          <button type="button" className="new-chat-btn" onClick={createAndActivateChat}>
            <Plus size={16} />
            New chat
          </button>
        </div>

        <div className="sidebar-brand">
          <div className="brand-mark">
            <Bot size={20} />
          </div>
          <div>
            <strong>Ollama Agent</strong>
            <span>Local, streaming chat</span>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-head">
            <span>Chats</span>
            <button type="button" className="text-btn" onClick={createAndActivateChat}>
              <Plus size={14} />
              New
            </button>
          </div>

          <div className="chat-list">
            {chats
              .slice()
              .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
              .map((chat) => {
                const active = chat.id === currentChat?.id;
                return (
                  <div
                    key={chat.id}
                    role="button"
                    tabIndex={0}
                    className={`chat-list-item ${active ? 'is-active' : ''}`}
                    onClick={() => selectChat(chat.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectChat(chat.id);
                      }
                    }}
                  >
                    <div className="chat-list-item-main">
                      <strong>{chat.title}</strong>
                      <span>{messagePreview(chat.messages[chat.messages.length - 1]) || 'Empty conversation'}</span>
                    </div>
                    <div className="chat-list-item-meta">
                      <small>{prettyDate(chat.updatedAt)}</small>
                      <button
                        type="button"
                        className="tiny-icon-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteChat(chat.id);
                        }}
                        aria-label={`Delete ${chat.title}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="sidebar-footer">
          <button type="button" className="settings-row" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={16} />
            Settings
            <ChevronDown size={16} className="chevron-indicator" />
          </button>
          <div className="sidebar-status">
            <span className={models.length ? 'status-dot is-ready' : 'status-dot is-warn'} />
            <span>{status}</span>
          </div>
        </div>
      </aside>

      <main className="chat-main">
        <header className="chat-header">
          <div className="chat-header-left">
            <button type="button" className="ghost-icon-btn mobile-only" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
              <Menu size={18} />
            </button>
            <div className="chat-title-group">
              <p className="eyebrow">Local Ollama workspace</p>
              <h1>{currentChat?.title || 'Chat'}</h1>
              <div className="chat-header-meta">
                <span>{activeModel || 'No model selected'}</span>
                <span>{currentMessages.length} messages</span>
              </div>
            </div>
          </div>

          <div className="chat-header-actions">
            <button type="button" className="secondary-btn" onClick={() => setSettingsOpen(true)}>
              <Settings2 size={16} />
              Model settings
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={stopStreaming}
              disabled={!isSending}
            >
              <Square size={14} />
              Stop
            </button>
          </div>
        </header>

        <section className="chat-stage">
          {currentMessages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-card">
                <div className="empty-badge">
                  <Bot size={16} />
                  Ready for a local model
                </div>
                <h2>Talk to your own Ollama instance.</h2>
                <p>
                  Pick a model in settings, start a conversation, and watch the response stream in real time.
                  Everything stays on your machine.
                </p>
                <div className="prompt-grid">
                  {PROMPTS.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className="prompt-card"
                      onClick={() => {
                        setDraft(item.prompt);
                        setStatus(`Loaded preset: ${item.label}.`);
                      }}
                    >
                      <strong>{item.label}</strong>
                      <span>{item.prompt}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="message-list">
              {currentMessages.map((message) => {
                const isAssistant = message.role === 'assistant';
                const isStreaming = Boolean(message.isStreaming);
                return (
                  <article key={message.id} className={`message-row ${isAssistant ? 'is-assistant' : 'is-user'}`}>
                    <div className="message-avatar">
                      {isAssistant ? <Bot size={18} /> : <UserRound size={18} />}
                    </div>
                    <div className="message-bubble">
                      <div className="message-bubble-head">
                        <strong>{isAssistant ? 'Assistant' : 'You'}</strong>
                        <span>{prettyTime(message.createdAt)}</span>
                      </div>
                      <div className={`markdown-prose ${isStreaming ? 'is-streaming' : ''}`}>
                        {message.content ? (
                          <ReactMarkdown components={markdownComponents()}>{message.content}</ReactMarkdown>
                        ) : isStreaming ? (
                          <div className="typing-line">
                            <Loader2 size={14} className="spin" />
                            Thinking...
                          </div>
                        ) : null}
                        {isStreaming && message.content ? <span className="stream-cursor" aria-hidden="true" /> : null}
                      </div>
                      {isAssistant ? (
                        <div className="message-actions">
                          <button
                            type="button"
                            className="text-btn"
                            onClick={() => copyMessage(message)}
                          >
                            {copiedMessageId === message.id ? <Check size={14} /> : <Copy size={14} />}
                            {copiedMessageId === message.id ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </section>

        <footer className="composer-shell">
          <div className="composer-toolbar">
            <button type="button" className="composer-chip" onClick={() => setSettingsOpen(true)}>
              <Settings2 size={14} />
              {activeModel || 'Select a model'}
            </button>
            <button type="button" className="composer-chip" onClick={createAndActivateChat}>
              <PanelLeft size={14} />
              New chat
            </button>
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Send a message to your local model..."
              rows={1}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleSubmit(event);
                }
              }}
            />
            <button type="submit" className="send-btn" disabled={!draft.trim() || isSending || !activeModel}>
              {isSending ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
              {isSending ? 'Sending' : 'Send'}
            </button>
          </form>
          <p className="composer-note">
            Streaming is proxied through your local server to <code>{API_BASE}</code>.
          </p>
        </footer>

        <section className="workspace-shell">
          <div className="workspace-pane">
            <div className="workspace-head">
              <div>
                <p className="eyebrow">Local workspace</p>
                <h2>Files on this machine</h2>
                <p>Open, edit, save, and create files inside a local folder rooted on this computer.</p>
              </div>
              <button type="button" className="secondary-btn" onClick={refreshWorkspace}>
                <RefreshCw size={16} className={workspaceLoading ? 'spin' : ''} />
                Refresh
              </button>
            </div>

            <div className="workspace-builder">
              <label className="field-group">
                <span>New file path</span>
                <input
                  type="text"
                  value={newFilePath}
                  onChange={(event) => setNewFilePath(event.target.value)}
                  placeholder="src/app.js"
                />
              </label>
              <label className="field-group">
                <span>New folder path</span>
                <input
                  type="text"
                  value={newFolderPath}
                  onChange={(event) => setNewFolderPath(event.target.value)}
                  placeholder="src/components"
                />
              </label>
              <div className="workspace-builder-actions">
                <button type="button" className="secondary-btn" onClick={createWorkspaceFolder}>
                  <Folder size={16} />
                  Create folder
                </button>
                <button type="button" className="primary-btn" onClick={createWorkspaceFile}>
                  <Plus size={16} />
                  Create file
                </button>
              </div>
            </div>

            {workspaceError ? <div className="notice error">{workspaceError}</div> : null}

            <div className="workspace-tree">
              {flatWorkspaceItems.length ? flatWorkspaceItems.map((item) => (
                item.type === 'directory' ? (
                  <div key={item.path} className="workspace-row directory" style={{ paddingLeft: `${12 + item.depth * 16}px` }}>
                    <Folder size={15} />
                    <span>{item.name}</span>
                  </div>
                ) : (
                  <button
                    key={item.path}
                    type="button"
                    className={`workspace-row file ${selectedFilePath === item.path ? 'is-active' : ''}`}
                    style={{ paddingLeft: `${12 + item.depth * 16}px` }}
                    onClick={() => openWorkspaceFile(item.path)}
                  >
                    <FileText size={15} />
                    <span>{item.name}</span>
                    <small>{item.path}</small>
                  </button>
                )
              )) : (
                <div className="workspace-empty">
                  <strong>No files yet.</strong>
                  <span>Create a file or folder to begin.</span>
                </div>
              )}
            </div>
          </div>

          <div className="workspace-editor">
            <div className="workspace-editor-head">
              <div>
                <p className="eyebrow">Editor</p>
                <h2>{selectedFilePath || 'No file open'}</h2>
              </div>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => saveWorkspaceFile()}
                disabled={!selectedFilePath}
              >
                <Save size={16} />
                Save file
              </button>
            </div>
            <textarea
              className="workspace-editor-textarea"
              value={fileDraft}
              onChange={(event) => setFileDraft(event.target.value)}
              placeholder="Open a file or create a new one to start editing."
            />
            <div className="workspace-editor-footer">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setFileDraft('');
                  setSelectedFilePath(newFilePath);
                  setStatus('Editor cleared.');
                }}
              >
                New draft
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => saveWorkspaceFile(selectedFilePath, fileDraft)}
                disabled={!selectedFilePath}
              >
                Save current file
              </button>
            </div>
          </div>
        </section>
      </main>

      {sidebarOpen ? <button type="button" className="backdrop" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar backdrop" /> : null}

      {settingsOpen ? (
        <div className="settings-modal" role="dialog" aria-modal="true" aria-label="Model settings">
          <button type="button" className="settings-backdrop" onClick={() => setSettingsOpen(false)} aria-label="Close settings" />
          <section className="settings-panel">
            <div className="settings-header">
              <div>
                <p className="eyebrow">Settings</p>
                <h2>Choose your Ollama model</h2>
                <p>
                  The app reads local models from <code>http://localhost:11434</code> through the backend.
                </p>
              </div>
              <button type="button" className="ghost-icon-btn" onClick={() => setSettingsOpen(false)} aria-label="Close settings panel">
                <X size={18} />
              </button>
            </div>

            <label className="field-group">
              <span>Available models</span>
              <div className="select-shell">
                <select
                  value={activeModel}
                  onChange={(event) => updateCurrentChatModel(event.target.value)}
                  disabled={modelsLoading || !models.length}
                >
                  <option value="" disabled>
                    {modelsLoading ? 'Loading models...' : 'Select a model'}
                  </option>
                  {models.map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="select-icon" />
              </div>
            </label>

            <div className="control-card">
              <div className="control-card-head">
                <strong>Offline control set</strong>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={controls.offlineOnly}
                    onChange={(event) => setControls((current) => ({ ...current, offlineOnly: event.target.checked }))}
                  />
                  <span>Stay offline only</span>
                </label>
              </div>
              <p>
                Everything in this app routes to your local Ollama server. No cloud APIs are used by the chat flow.
              </p>

              <label className="field-group">
                <span>System prompt</span>
                <textarea
                  className="control-textarea"
                  value={controls.systemPrompt}
                  onChange={(event) => setControls((current) => ({ ...current, systemPrompt: event.target.value }))}
                  rows={4}
                />
              </label>

              <div className="control-grid">
                <label className="field-group">
                  <span>Temperature</span>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={controls.temperature}
                    onChange={(event) => setControls((current) => ({ ...current, temperature: event.target.value }))}
                  />
                </label>
                <label className="field-group">
                  <span>Top P</span>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={controls.topP}
                    onChange={(event) => setControls((current) => ({ ...current, topP: event.target.value }))}
                  />
                </label>
                <label className="field-group">
                  <span>Top K</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={controls.topK}
                    onChange={(event) => setControls((current) => ({ ...current, topK: event.target.value }))}
                  />
                </label>
                <label className="field-group">
                  <span>Max tokens</span>
                  <input
                    type="number"
                    min="16"
                    step="16"
                    value={controls.numPredict}
                    onChange={(event) => setControls((current) => ({ ...current, numPredict: event.target.value }))}
                  />
                </label>
                <label className="field-group">
                  <span>Context window</span>
                  <input
                    type="number"
                    min="512"
                    step="512"
                    value={controls.numCtx}
                    onChange={(event) => setControls((current) => ({ ...current, numCtx: event.target.value }))}
                  />
                </label>
                <label className="field-group">
                  <span>Repeat penalty</span>
                  <input
                    type="number"
                    min="0.5"
                    max="2"
                    step="0.05"
                    value={controls.repeatPenalty}
                    onChange={(event) => setControls((current) => ({ ...current, repeatPenalty: event.target.value }))}
                  />
                </label>
                <label className="field-group">
                  <span>Seed</span>
                  <input
                    type="number"
                    placeholder="Optional"
                    value={controls.seed}
                    onChange={(event) => setControls((current) => ({ ...current, seed: event.target.value }))}
                  />
                </label>
                <label className="field-group control-span-2">
                  <span>Keep alive</span>
                  <input
                    type="text"
                    value={controls.keepAlive}
                    onChange={(event) => setControls((current) => ({ ...current, keepAlive: event.target.value }))}
                    placeholder="10m"
                  />
                </label>
              </div>
            </div>

            <div className="settings-actions">
              <button type="button" className="secondary-btn" onClick={() => {
                setModelsError('');
                setModelsLoading(true);
                fetch(`${API_BASE}/api/ollama/models`)
                  .then((response) => response.json().then((data) => ({ response, data })))
                  .then(({ response, data }) => {
                    if (!response.ok) throw new Error(data.detail || data.error || 'Unable to reach Ollama.');
                    const nextModels = Array.isArray(data.models) ? data.models : [];
                    setModels(nextModels);
                    if (nextModels.length) {
                      const nextSelected = nextModels.some((model) => model.name === activeModel)
                        ? activeModel
                        : nextModels[0].name;
                      updateCurrentChatModel(nextSelected);
                    }
                    setStatus(nextModels.length ? `Loaded ${nextModels.length} model(s).` : 'No models found.');
                  })
                  .catch((error) => {
                    setModelsError(error.message || 'Refresh failed.');
                    setStatus('Unable to refresh models.');
                  })
                  .finally(() => setModelsLoading(false));
              }}>
                <RefreshCw size={16} className={modelsLoading ? 'spin' : ''} />
                Refresh models
              </button>
              <button type="button" className="primary-btn" onClick={() => setSettingsOpen(false)}>
                Done
              </button>
            </div>

            {modelsError ? <div className="notice error">{modelsError}</div> : null}

            <div className="model-list">
              {models.length ? models.map((model) => (
                <button
                  key={model.name}
                  type="button"
                  className={`model-row ${activeModel === model.name ? 'is-active' : ''}`}
                  onClick={() => updateCurrentChatModel(model.name)}
                >
                  <div>
                    <strong>{model.name}</strong>
                    <span>{model.details?.parameter_size || model.size ? `${model.details?.parameter_size || model.size}` : 'Local model'}</span>
                  </div>
                  {activeModel === model.name ? <Check size={16} /> : null}
                </button>
              )) : (
                <div className="model-empty">
                  <p>No models are available yet.</p>
                  <span>Pull a model in Ollama, then refresh this panel.</span>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
