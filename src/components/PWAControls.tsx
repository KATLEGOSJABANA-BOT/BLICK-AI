import React, { useState } from 'react';
import { Check, Download, Monitor, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../lib/pwa';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [downloadedOs, setDownloadedOs] = useState<string | null>(null);

  if (isInstalled) {
    return null;
  }

  const appOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://blick.ai';

  const downloadLauncher = (os: 'windows' | 'macos' | 'linux') => {
    let filename = '';
    let content = '';
    let mime = 'text/plain;charset=utf-8';

    if (os === 'windows') {
      filename = 'Blick-AI-Desktop.bat';
      content = [
        '@echo off',
        `set "URL=${appOrigin}"`,
        'where msedge >nul 2>&1 && (start "" msedge --app="%URL%" & exit /b)',
        'where chrome >nul 2>&1 && (start "" chrome --app="%URL%" & exit /b)',
        'start "" "%URL%"',
      ].join('\r\n');
    } else if (os === 'macos') {
      filename = 'Blick-AI-Desktop.command';
      content = [
        '#!/bin/bash',
        `URL="${appOrigin}"`,
        'if [ -d "/Applications/Google Chrome.app" ]; then',
        '  open -na "Google Chrome" --args --app="$URL"',
        'elif [ -d "/Applications/Microsoft Edge.app" ]; then',
        '  open -na "Microsoft Edge" --args --app="$URL"',
        'else',
        '  open "$URL"',
        'fi',
      ].join('\n');
    } else {
      filename = 'blick-ai.desktop';
      content = [
        '[Desktop Entry]',
        'Version=1.0',
        'Type=Application',
        'Name=Blick AI',
        'Comment=Unified AI Studio for Chat, Websites, Debugging, Images & Voice',
        `Exec=xdg-open ${appOrigin}`,
        'Terminal=false',
        'Categories=Development;Utility;',
      ].join('\n');
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadedOs(os);
    setTimeout(() => setDownloadedOs(null), 2500);
  };

  const handlePrimaryClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handlePrimaryClick}
        className={`inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          compact ? 'min-h-[40px] px-3 py-1.5 text-xs font-medium' : 'min-h-[40px] px-4 py-2 text-xs font-medium'
        }`}
        title="Install or Download Blick AI for Desktop & Mobile"
      >
        <Download className="w-3.5 h-3.5 text-blue-500 shrink-0" />
        <span>{isInstallable ? 'Install App' : 'Download App'}</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400">
                  {isIOS ? <Smartphone className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                </div>
                <div>
                  <h3 id="pwa-guide-title" className="text-base font-semibold text-slate-900 dark:text-white">
                    Download &amp; Install Blick AI
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Run Blick AI as a standalone desktop or mobile application
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Close install dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4">
                <div className="text-xs font-semibold text-slate-900 dark:text-white mb-2">
                  Install on iPhone / iPad
                </div>
                <ol className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                  <li>1. Open this app directly in Safari.</li>
                  <li>2. Tap the <strong>Share</strong> icon in the Safari toolbar.</li>
                  <li>3. Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                </ol>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white mb-1.5">
                    Option 1 — Native Browser Install (Recommended)
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Open Blick AI directly in Chrome or Edge, then click the <strong>Install Blick AI</strong> icon in your address bar (or browser menu &gt; <em>Cast, save, and share</em> &gt; <em>Install Blick AI</em>). This installs it to your Applications folder or Start Menu with offline shell support.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white mb-2">
                    Option 2 — Download Desktop App Launcher
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                    Download a standalone window launcher for your operating system (includes Chat, Image Studio, Site Studio, Code Debugger, Motion, and Voice):
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => downloadLauncher('windows')}
                      className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 hover:border-blue-500 cursor-pointer"
                    >
                      {downloadedOs === 'windows' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Download className="w-3.5 h-3.5 text-blue-500" />
                      )}
                      <span>Windows (.bat)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => downloadLauncher('macos')}
                      className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 hover:border-blue-500 cursor-pointer"
                    >
                      {downloadedOs === 'macos' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Download className="w-3.5 h-3.5 text-blue-500" />
                      )}
                      <span>macOS (.command)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => downloadLauncher('linux')}
                      className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 hover:border-blue-500 cursor-pointer"
                    >
                      {downloadedOs === 'linux' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Download className="w-3.5 h-3.5 text-blue-500" />
                      )}
                      <span>Linux (.desktop)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full min-h-[44px] rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white shadow-lg">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Offline Mode — Cached workspace shell active</span>
    </div>
  );
};
