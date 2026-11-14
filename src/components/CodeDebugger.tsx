import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bug,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  Save,
  ShieldAlert,
} from 'lucide-react';
import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { DebugReport } from '../types/blick';

interface CodeDebuggerProps {
  initialCode?: string;
}

const SAMPLE_BUG = `async function fetchUserOrders(userIds) {
  const results = [];
  userIds.forEach(async (id) => {
    const res = await fetch('/api/orders/' + id);
    const data = res.json();
    results.push(data);
  });
  return results;
}`;

export const CodeDebugger: React.FC<CodeDebuggerProps> = ({ initialCode = '' }) => {
  const { user } = useAuth();
  const [code, setCode] = useState(initialCode || SAMPLE_BUG);
  const [language, setLanguage] = useState('Auto-detect');
  const [errorLog, setErrorLog] = useState('');
  const [goal, setGoal] = useState('');

  const [report, setReport] = useState<DebugReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (initialCode) setCode(initialCode);
  }, [initialCode]);

  const handleAnalyze = async () => {
    if (!code.trim() || isAnalyzing) return;
    setIsAnalyzing(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, errorLog, language, goal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Debugging request failed');
      setReport(data as DebugReport);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to analyze code');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopyFix = () => {
    if (!report?.fixedCode) return;
    navigator.clipboard.writeText(report.fixedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownloadFix = () => {
    if (!report?.fixedCode) return;
    const blob = new Blob([report.fixedCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fixed-code.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveReport = async () => {
    if (!user || !user.emailVerified || !report) return;
    const ref = doc(collection(db, 'projects'));
    try {
      await setDoc(ref, {
        id: ref.id,
        userId: user.uid,
        kind: 'debug',
        title: `${report.detectedLanguage || language} Debug (${report.severity})`.slice(0, 160),
        prompt: (errorLog || goal || 'Code analysis').slice(0, 10000),
        code: report.fixedCode.slice(0, 250000),
        language: (report.detectedLanguage || language).slice(0, 60),
        summary: `${report.summary}\n\nRoot Cause: ${report.rootCause}`.slice(0, 20000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `projects/${ref.id}`);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/* Left: Input Code & Trace */}
      <div className="flex-1 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800/80 p-4 sm:p-5 overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Code Debugger
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Deep root-cause analysis, race conditions, security audit &amp; drop-in fix
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              aria-label="Programming Language"
              className="min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              <option value="Auto-detect">Auto-detect</option>
              <option value="TypeScript">TypeScript</option>
              <option value="JavaScript">JavaScript</option>
              <option value="Python">Python</option>
              <option value="Go">Go</option>
              <option value="Rust">Rust</option>
              <option value="SQL">SQL</option>
              <option value="HTML/CSS">HTML/CSS</option>
            </select>
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isAnalyzing || !code.trim()}
              className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Bug className="w-3.5 h-3.5" />
                  <span>Debug Code</span>
                </>
              )}
            </button>
          </div>
        </div>

        <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
          Source Code
        </label>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          placeholder="Paste buggy function, component, API route, or SQL query..."
          className="flex-1 min-h-[240px] rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-950 p-3.5 font-mono text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Error / Stack Trace (optional)
            </label>
            <textarea
              rows={3}
              value={errorLog}
              onChange={(e) => setErrorLog(e.target.value)}
              placeholder="TypeError: Cannot read properties of undefined..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 font-mono text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Expected Behavior (optional)
            </label>
            <textarea
              rows={3}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Should return all resolved order arrays in parallel..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="mt-3 rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/50 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Right: Diagnostics & Patched Code */}
      <div className="flex-1 flex flex-col min-h-0 p-4 sm:p-5 overflow-y-auto bg-slate-50/70 dark:bg-slate-950/40">
        {!report ? (
          <div className="m-auto max-w-md text-center py-12">
            <ShieldAlert className="w-8 h-8 text-slate-400 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Diagnostic Report Ready
            </h3>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              Click <strong>Debug Code</strong> to run Gemini 4 Carbon root-cause inspection, view itemized defects, and get a clean, production-ready patch.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="font-semibold text-slate-900 dark:text-white">
                  Severity: {report.severity}
                </span>
                <span aria-hidden="true" className="text-slate-400">·</span>
                <span className="text-slate-500 dark:text-slate-400 font-mono">
                  {report.detectedLanguage}
                </span>
              </div>
              {user && (
                <button
                  type="button"
                  onClick={handleSaveReport}
                  className="min-h-[32px] inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  {savedNotice ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{savedNotice ? 'Saved' : 'Save Report'}</span>
                </button>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Root Cause
              </h3>
              <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                {report.rootCause}
              </p>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                Detected Issues ({report.issues.length})
              </h3>
              <div className="space-y-2.5">
                {report.issues.map((issue, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 text-xs"
                  >
                    <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                      <span className="font-mono text-blue-600 dark:text-blue-400">
                        {issue.lineHint}
                      </span>
                      <span aria-hidden="true" className="text-slate-400">·</span>
                      <span>{issue.category}</span>
                    </div>
                    <p className="mt-1 text-slate-600 dark:text-slate-300">{issue.description}</p>
                    <p className="mt-1.5 text-emerald-700 dark:text-emerald-400">
                      Fix: {issue.fixExplanation}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Patched Code
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCode(report.fixedCode)}
                    className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Apply to Editor
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyFix}
                    className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadFix}
                    className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>
              <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-3.5 font-mono text-xs text-slate-100">
                <code>{report.fixedCode}</code>
              </pre>
            </div>

            {report.verificationSteps.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                  Verification Checklist
                </h3>
                <ul className="space-y-1.5">
                  {report.verificationSteps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
