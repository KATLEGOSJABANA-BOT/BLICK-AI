import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowUp,
  Bug,
  Check,
  Copy,
  Globe,
  ImagePlus,
  Layout,
  Loader2,
  Paperclip,
  Plus,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  ChatAttachment,
  ChatMessageItem,
  ChatModelId,
  ChatPersona,
  ChatThreadItem,
  ThinkingDepth,
} from '../types/blick';

interface ChatWorkspaceProps {
  onSendToWebsiteBuilder: (code: string, prompt: string) => void;
  onSendToDebugger: (code: string) => void;
}

const STARTER_PROMPTS = [
  {
    title: 'System Architecture',
    prompt: 'Design a low-latency distributed rate limiter in TypeScript + Redis and explain edge cases.',
  },
  {
    title: 'Research Brief',
    prompt: 'Compare modern edge runtimes, WebAssembly workers, and container cold starts with trade-offs.',
  },
  {
    title: 'Landing Page Spec',
    prompt: 'Draft a complete single-file responsive SaaS pricing page in HTML + Tailwind CSS.',
  },
  {
    title: 'SQL & Query Tuning',
    prompt: 'How do composite B-tree index column orders affect range scans and sorting in Postgres?',
  },
];

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  onSendToWebsiteBuilder,
  onSendToDebugger,
}) => {
  const { user, authReady } = useAuth();
  const [threads, setThreads] = useState<ChatThreadItem[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);

  const [model, setModel] = useState<ChatModelId>('gemini-4-hydrogen');
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingDepth>('HIGH');
  const [persona, setPersona] = useState<ChatPersona>('balanced');
  const [useSearch, setUseSearch] = useState(false);

  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync threads for signed-in users
  useEffect(() => {
    if (!authReady || !user) {
      setThreads([]);
      return;
    }

    const q = query(
      collection(db, 'chats'),
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list: ChatThreadItem[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title || 'Untitled Chat',
            model: (data.model as ChatModelId) || 'gemini-4-hydrogen',
            createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
            updatedAt: data.updatedAt?.toMillis?.() ?? Date.now(),
          };
        });
        setThreads(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'chats');
      }
    );

    return () => unsubscribe();
  }, [authReady, user]);

  // Sync messages of active chat when signed in
  useEffect(() => {
    if (!authReady || !user || !activeChatId) return;

    const msgPath = `chats/${activeChatId}/messages`;
    const q = query(
      collection(db, 'chats', activeChatId, 'messages'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list: ChatMessageItem[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            role: data.role,
            content: data.content,
            model: data.model || 'gemini-4-hydrogen',
            hasAttachment: Boolean(data.hasAttachment),
            createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
          };
        });
        setMessages(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, msgPath);
      }
    );

    return () => unsubscribe();
  }, [authReady, user, activeChatId]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isStreaming]);

  const handleNewChat = () => {
    if (isStreaming) {
      abortRef.current?.abort();
      setIsStreaming(false);
    }
    setActiveChatId(null);
    setMessages([]);
    setErrorMsg(null);
  };

  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    const path = `chats/${chatId}`;
    try {
      await deleteDoc(doc(db, 'chats', chatId));
      if (activeChatId === chatId) {
        setActiveChatId(null);
        setMessages([]);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      setAttachment({
        name: file.name,
        mimeType: file.type || 'image/png',
        data: base64,
        previewUrl: result,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSpeak = async (msgId: string, text: string) => {
    if (speakingId === msgId) {
      audioRef.current?.pause();
      audioRef.current = null;
      setSpeakingId(null);
      return;
    }

    setSpeakingId(msgId);
    try {
      const cleanText = text.replace(/```[\s\S]*?```/g, ' [code block omitted] ').slice(0, 3500);
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanText,
          voiceName: 'Kore',
          style: 'Clear, calm, articulate AI studio assistant',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'TTS failed');
      const audio = new Audio(data.audioDataUrl);
      audioRef.current = audio;
      audio.onended = () => setSpeakingId(null);
      audio.onerror = () => setSpeakingId(null);
      await audio.play();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to generate speech');
      setSpeakingId(null);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleSend = async (customPrompt?: string) => {
    const promptText = (customPrompt ?? input).trim();
    if ((!promptText && !attachment) || isStreaming) return;

    setErrorMsg(null);
    if (!customPrompt) setInput('');
    const currentAttachment = attachment;
    setAttachment(null);

    let chatId = activeChatId;
    const isSignedInVerified = Boolean(user && user.emailVerified);

    // Create thread in Firestore if signed in
    if (isSignedInVerified && !chatId && user) {
      const newChatRef = doc(collection(db, 'chats'));
      chatId = newChatRef.id;
      const title = (promptText || currentAttachment?.name || 'New Conversation').slice(0, 120);
      try {
        await setDoc(newChatRef, {
          id: chatId,
          userId: user.uid,
          title,
          model,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setActiveChatId(chatId);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `chats/${chatId}`);
      }
    }

    const userMsgId = `msg_${Date.now()}_u`;
    const userMessage: ChatMessageItem = {
      id: userMsgId,
      role: 'user',
      content: promptText || `Analyze attached file: ${currentAttachment?.name}`,
      model,
      createdAt: Date.now(),
      attachment: currentAttachment || undefined,
      hasAttachment: Boolean(currentAttachment),
    };

    const assistantMsgId = `msg_${Date.now()}_a`;
    const assistantPlaceholder: ChatMessageItem = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      model,
      createdAt: Date.now(),
    };

    const historySnapshot = [...messages, userMessage];
    setMessages([...historySnapshot, assistantPlaceholder]);

    if (isSignedInVerified && chatId && user) {
      const msgRef = doc(collection(db, 'chats', chatId, 'messages'));
      try {
        await setDoc(msgRef, {
          id: msgRef.id,
          chatId,
          userId: user.uid,
          role: 'user',
          content: userMessage.content.slice(0, 100000),
          model,
          hasAttachment: Boolean(currentAttachment),
          createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'chats', chatId), {
          model,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `chats/${chatId}/messages`);
      }
    }

    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    let accumulatedText = '';
    let sources: Array<{ title: string; url: string }> = [];

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          thinkingLevel,
          persona,
          useSearch,
          messages: historySnapshot.map((m) => ({
            role: m.role,
            text: m.content,
            attachment: m.attachment
              ? { data: m.attachment.data, mimeType: m.attachment.mimeType }
              : undefined,
          })),
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Request failed (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Stream unavailable.');
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const evt of events) {
          const line = evt.trim();
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;
          const payload = JSON.parse(jsonStr);
          if (payload.error) throw new Error(payload.error);
          if (payload.text) {
            accumulatedText += payload.text;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, content: accumulatedText } : m
              )
            );
          }
          if (payload.sources) {
            sources = payload.sources;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? { ...m, sources } : m))
            );
          }
        }
      }

      if (isSignedInVerified && chatId && user && accumulatedText.trim()) {
        const replyRef = doc(collection(db, 'chats', chatId, 'messages'));
        try {
          await setDoc(replyRef, {
            id: replyRef.id,
            chatId,
            userId: user.uid,
            role: 'assistant',
            content: accumulatedText.slice(0, 100000),
            model,
            hasAttachment: false,
            createdAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `chats/${chatId}/messages`);
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : 'Failed to reach Blick AI';
        setErrorMsg(msg);
        if (!accumulatedText) {
          setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId));
        }
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/* Thread History Rail (Desktop) */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-slate-200 dark:border-slate-800/80 bg-slate-100/60 dark:bg-slate-950/40">
        <div className="p-3 border-b border-slate-200 dark:border-slate-800/80">
          <button
            type="button"
            onClick={handleNewChat}
            className="w-full min-h-[40px] flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Thread</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {!user ? (
            <div className="p-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Sign in with Google to save and sync conversation threads across mobile and desktop.
            </div>
          ) : threads.length === 0 ? (
            <div className="p-3 text-xs text-slate-500 dark:text-slate-400">
              Your saved conversations will appear here.
            </div>
          ) : (
            threads.map((t) => (
              <div
                key={t.id}
                onClick={() => setActiveChatId(t.id)}
                className={`group flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-xs cursor-pointer transition-colors ${
                  activeChatId === t.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-900'
                }`}
              >
                <span className="truncate">{t.title}</span>
                <button
                  type="button"
                  onClick={(e) => handleDeleteChat(t.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-red-500 transition-opacity"
                  aria-label="Delete chat"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main Conversation Canvas */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Studio Parameter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800/80 bg-white/70 dark:bg-slate-950/60 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as ChatModelId)}
              aria-label="Select AI Model"
              className="min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="gemini-4-hydrogen">Gemini 4 Hydrogen (Fast)</option>
              <option value="gemini-4-argon">Gemini 4 Argon (Pro Reasoning)</option>
              <option value="gemini-4-carbon">Gemini 4 Carbon (Deep Architecture)</option>
            </select>

            <select
              value={thinkingLevel}
              onChange={(e) => setThinkingLevel(e.target.value as ThinkingDepth)}
              aria-label="Reasoning Depth"
              className="min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="LOW">Depth: Fast</option>
              <option value="MEDIUM">Depth: Balanced</option>
              <option value="HIGH">Depth: High</option>
              {model === 'gemini-4-hydrogen' && <option value="XHIGH">Depth: Maximum</option>}
            </select>

            <select
              value={persona}
              onChange={(e) => setPersona(e.target.value as ChatPersona)}
              aria-label="Response Style"
              className="hidden sm:block min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="balanced">Style: Balanced</option>
              <option value="concise">Style: Concise</option>
              <option value="architect">Style: Architect</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setUseSearch((s) => !s)}
              className={`min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                useSearch
                  ? 'border-blue-500 bg-blue-600/10 text-blue-600 dark:text-blue-400'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Web Grounding</span>
            </button>
            <button
              type="button"
              onClick={handleNewChat}
              className="lg:hidden min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          </div>
        </div>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          {messages.length === 0 ? (
            <div className="mx-auto max-w-3xl pt-4 sm:pt-10">
              <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight text-slate-900 dark:text-white text-balance">
                Think deeper, build faster with Blick AI.
              </h1>
              <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-2xl">
                Multi-model reasoning with live web grounding, multimodal vision, instant code debugging, and one-click voice playback.
              </p>

              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {STARTER_PROMPTS.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => handleSend(item.prompt)}
                    className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-4 hover:border-blue-500/60 transition-colors cursor-pointer"
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {item.title}
                    </div>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                      {item.prompt}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div className="mb-1.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {msg.role === 'user' ? user?.displayName || 'You' : 'Blick AI'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-[11px]">{msg.model}</span>
                  </div>

                  {msg.attachment && (
                    <img
                      src={msg.attachment.previewUrl}
                      alt={msg.attachment.name}
                      referrerPolicy="no-referrer"
                      className="mb-2 max-h-56 rounded-xl border border-slate-200 dark:border-slate-800 object-contain"
                    />
                  )}

                  {msg.role === 'user' ? (
                    <div className="max-w-[85%] rounded-2xl bg-blue-600 px-4 py-3 text-sm text-white whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 px-5 py-4 text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                      {msg.content ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-800 prose-pre:rounded-xl prose-code:text-blue-600 dark:prose-code:text-blue-400">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({ className, children, ...props }) {
                                const match = /language-(\w+)/.exec(className || '');
                                const codeStr = String(children).replace(/\n$/, '');
                                const isBlock = Boolean(match) || codeStr.includes('\n');
                                if (!isBlock) {
                                  return (
                                    <code
                                      className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-xs font-mono"
                                      {...props}
                                    >
                                      {children}
                                    </code>
                                  );
                                }
                                const lang = match?.[1]?.toLowerCase() || 'code';
                                const isHtml = lang === 'html' || codeStr.includes('<!DOCTYPE html');
                                return (
                                  <div className="my-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800 text-xs text-slate-400">
                                      <span className="font-mono">{lang}</span>
                                      <div className="flex items-center gap-2">
                                        {isHtml && (
                                          <button
                                            type="button"
                                            onClick={() => onSendToWebsiteBuilder(codeStr, 'Refine from chat')}
                                            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
                                          >
                                            <Layout className="w-3 h-3" />
                                            <span>Preview Site</span>
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => onSendToDebugger(codeStr)}
                                          className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white cursor-pointer"
                                        >
                                          <Bug className="w-3 h-3" />
                                          <span>Debug</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleCopy(codeStr.slice(0, 32), codeStr)}
                                          className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white cursor-pointer"
                                        >
                                          {copiedId === codeStr.slice(0, 32) ? (
                                            <Check className="w-3 h-3 text-emerald-400" />
                                          ) : (
                                            <Copy className="w-3 h-3" />
                                          )}
                                          <span>Copy</span>
                                        </button>
                                      </div>
                                    </div>
                                    <pre className="overflow-x-auto p-3 text-xs text-slate-100 font-mono">
                                      <code>{codeStr}</code>
                                    </pre>
                                  </div>
                                );
                              },
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                          <span>Thinking...</span>
                        </div>
                      )}

                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                            Sources
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs">
                            {msg.sources.map((src) => (
                              <a
                                key={src.url}
                                href={src.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[240px]"
                              >
                                {src.title}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {msg.content && (
                        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/70 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleCopy(msg.id, msg.content)}
                            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                          >
                            {copiedId === msg.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSpeak(msg.id, msg.content)}
                            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                          >
                            {speakingId === msg.id ? (
                              <Square className="w-3.5 h-3.5 text-blue-500" />
                            ) : (
                              <Volume2 className="w-3.5 h-3.5" />
                            )}
                            <span>{speakingId === msg.id ? 'Stop Voice' : 'Read Aloud'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div ref={scrollEndRef} />
            </div>
          )}
        </div>

        {/* Error Toast */}
        {errorMsg && (
          <div className="mx-4 mb-2 rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/60 px-4 py-2.5 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
            <span>{errorMsg}</span>
            <button type="button" onClick={() => setErrorMsg(null)} className="p-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Composer */}
        <div className="border-t border-slate-200 dark:border-slate-800/80 bg-white/90 dark:bg-[#0B0F19]/95 px-4 py-3 sm:px-8">
          <div className="mx-auto max-w-3xl">
            {attachment && (
              <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 px-3 py-1.5 text-xs">
                <ImagePlus className="w-3.5 h-3.5 text-blue-500" />
                <span className="truncate max-w-[200px]">{attachment.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  className="text-slate-500 hover:text-red-500"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-end gap-2 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 focus-within:border-blue-500 transition-colors">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,text/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
                title="Attach image or file"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask Blick AI anything, paste code, or attach an image..."
                className="flex-1 resize-none bg-transparent py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none max-h-40"
              />

              {isStreaming ? (
                <button
                  type="button"
                  onClick={() => {
                    abortRef.current?.abort();
                    setIsStreaming(false);
                  }}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-700 cursor-pointer"
                  title="Stop generating"
                >
                  <Square className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={!input.trim() && !attachment}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title="Send message"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
