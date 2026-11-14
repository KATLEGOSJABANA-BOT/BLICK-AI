import React, { useEffect, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  Loader2,
  Monitor,
  Save,
  Smartphone,
  Tablet,
  Wand2,
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { SavedProjectItem } from '../types/blick';

interface WebsiteBuilderProps {
  initialCode?: string;
  initialPrompt?: string;
}

const STYLE_PRESETS = [
  'Editorial Modern',
  'Minimalist SaaS',
  'Dark Architecture Studio',
  'Clean E-Commerce',
];

const STARTER_SITE_IDEAS = [
  'A modern specialty coffee roastery website with subscription tiers and origin story',
  'An indie SaaS analytics landing page with interactive pricing calculator and FAQ accordion',
  'A personal portfolio for a full-stack product engineer with filterable project cards',
];

export const WebsiteBuilder: React.FC<WebsiteBuilderProps> = ({
  initialCode = '',
  initialPrompt = '',
}) => {
  const { user, authReady } = useAuth();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [stylePreset, setStylePreset] = useState(STYLE_PRESETS[0]);
  const [model, setModel] = useState<'gemini-4-argon' | 'gemini-4-hydrogen'>('gemini-4-argon');

  const [title, setTitle] = useState('Untitled Website');
  const [summary, setSummary] = useState('');
  const [htmlCode, setHtmlCode] = useState(initialCode);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedSites, setSavedSites] = useState<SavedProjectItem[]>([]);

  useEffect(() => {
    if (initialCode) setHtmlCode(initialCode);
    if (initialPrompt) setPrompt(initialPrompt);
  }, [initialCode, initialPrompt]);

  useEffect(() => {
    if (!authReady || !user) {
      setSavedSites([]);
      return;
    }
    const q = query(
      collection(db, 'projects'),
      where('userId', '==', user.uid),
      where('kind', '==', 'website'),
      orderBy('updatedAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSavedSites(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              kind: 'website',
              title: data.title,
              prompt: data.prompt,
              code: data.code,
              language: data.language,
              summary: data.summary,
              createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
              updatedAt: data.updatedAt?.toMillis?.() ?? Date.now(),
            };
          })
        );
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'projects');
      }
    );
    return () => unsub();
  }, [authReady, user]);

  const handleGenerate = async (overridePrompt?: string) => {
    const activePrompt = (overridePrompt ?? prompt).trim();
    if (!activePrompt || isGenerating) return;
    setErrorMsg(null);
    setIsGenerating(true);

    try {
      const res = await fetch('/api/website', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: activePrompt,
          currentCode: htmlCode,
          stylePreset,
          model,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to build website');

      setTitle(data.title || 'Generated Website');
      setSummary(data.summary || '');
      setHtmlCode(data.html || '');
      setViewMode('preview');
      if (!overridePrompt) setPrompt('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Website generation error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadHtml = () => {
    if (!htmlCode) return;
    const blob = new Blob([htmlCode], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'blick-site'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveProject = async () => {
    if (!user || !user.emailVerified || !htmlCode) return;
    setIsSaving(true);
    const newDoc = doc(collection(db, 'projects'));
    try {
      await setDoc(newDoc, {
        id: newDoc.id,
        userId: user.uid,
        kind: 'website',
        title: title.slice(0, 160),
        prompt: (prompt || title).slice(0, 10000),
        code: htmlCode.slice(0, 250000),
        language: 'html',
        summary: summary.slice(0, 20000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `projects/${newDoc.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = () => {
    if (!htmlCode) return;
    navigator.clipboard.writeText(htmlCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const previewWidthClass =
    viewport === 'mobile' ? 'w-[375px]' : viewport === 'tablet' ? 'w-[768px]' : 'w-full';

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top Builder Controls */}
      <div className="border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/60 px-4 py-3 sm:px-6">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex-1 flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5">
            <Wand2 className="w-4 h-4 text-blue-500 shrink-0" />
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleGenerate();
              }}
              placeholder={
                htmlCode
                  ? 'Describe an update (e.g. "Add a 3-tier pricing grid and dark footer")...'
                  : 'Describe the website you want Blick AI to build...'
              }
              className="flex-1 bg-transparent py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => handleGenerate()}
              disabled={isGenerating || !prompt.trim()}
              className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Building...</span>
                </>
              ) : (
                <span>{htmlCode ? 'Update Site' : 'Build Site'}</span>
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={stylePreset}
              onChange={(e) => setStylePreset(e.target.value)}
              aria-label="Style Preset"
              className="min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              {STYLE_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <select
              value={model}
              onChange={(e) => setModel(e.target.value as 'gemini-4-argon' | 'gemini-4-hydrogen')}
              aria-label="Builder Model"
              className="min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              <option value="gemini-4-argon">Gemini 4 Argon (Pro)</option>
              <option value="gemini-4-hydrogen">Gemini 4 Hydrogen (Fast)</option>
            </select>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-2 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Main Preview / Code Workspace */}
      <div className="flex-1 flex min-h-0 flex-col lg:flex-row">
        {/* Saved Sites Sidebar (Desktop) */}
        {savedSites.length > 0 && (
          <aside className="hidden xl:flex w-56 shrink-0 flex-col border-r border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950/30 p-3 overflow-y-auto">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              Saved Websites
            </div>
            <div className="space-y-1">
              {savedSites.map((site) => (
                <button
                  key={site.id}
                  type="button"
                  onClick={() => {
                    setTitle(site.title);
                    setSummary(site.summary);
                    setHtmlCode(site.code);
                  }}
                  className="w-full text-left rounded-lg px-2.5 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 truncate cursor-pointer"
                >
                  {site.title}
                </button>
              ))}
            </div>
          </aside>
        )}

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-slate-200 dark:border-slate-800/80 bg-slate-100/70 dark:bg-slate-900/50">
            <div className="flex items-center gap-2 min-w-0">
              <div className="inline-flex rounded-lg bg-slate-200/80 dark:bg-slate-800 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    viewMode === 'preview'
                      ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('code')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    viewMode === 'code'
                      ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>HTML Code</span>
                </button>
              </div>
              <span className="hidden sm:inline text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
                {title}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {viewMode === 'preview' && htmlCode && (
                <div className="hidden md:flex items-center gap-1 mr-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewport('desktop')}
                    className={`p-1.5 rounded ${viewport === 'desktop' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}
                    title="Desktop view"
                  >
                    <Monitor className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewport('tablet')}
                    className={`p-1.5 rounded ${viewport === 'tablet' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}
                    title="Tablet view"
                  >
                    <Tablet className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewport('mobile')}
                    className={`p-1.5 rounded ${viewport === 'mobile' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}
                    title="Mobile view"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {htmlCode && (
                <>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="min-h-[34px] inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadHtml}
                    className="min-h-[34px] inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export HTML</span>
                  </button>
                  {user && (
                    <button
                      type="button"
                      onClick={handleSaveProject}
                      disabled={isSaving}
                      className="min-h-[34px] inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-white px-3 py-1 text-xs font-medium text-white dark:text-slate-900 cursor-pointer"
                    >
                      {savedNotice ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                      <span>{savedNotice ? 'Saved' : 'Save'}</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 min-h-0 overflow-auto bg-slate-200/70 dark:bg-slate-950 p-3 sm:p-5 flex justify-center">
            {!htmlCode ? (
              <div className="m-auto max-w-2xl text-center p-6">
                <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white">
                  Instant Website Builder
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  Describe any landing page, dashboard, or portfolio above. Blick AI builds responsive HTML, Tailwind styling, and client interactivity with live preview and one-click export.
                </p>
                <div className="mt-6 grid grid-cols-1 gap-2.5 text-left">
                  {STARTER_SITE_IDEAS.map((idea) => (
                    <button
                      key={idea}
                      type="button"
                      onClick={() => handleGenerate(idea)}
                      className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 text-xs text-slate-700 dark:text-slate-300 hover:border-blue-500 transition-colors cursor-pointer"
                    >
                      {idea}
                    </button>
                  ))}
                </div>
              </div>
            ) : viewMode === 'preview' ? (
              <iframe
                title="Website Preview"
                srcDoc={htmlCode}
                sandbox="allow-scripts allow-forms allow-modals"
                className={`${previewWidthClass} h-full min-h-[500px] rounded-xl border border-slate-300 dark:border-slate-800 bg-white shadow-lg transition-all`}
              />
            ) : (
              <textarea
                value={htmlCode}
                onChange={(e) => setHtmlCode(e.target.value)}
                spellCheck={false}
                className="w-full h-full min-h-[500px] rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
