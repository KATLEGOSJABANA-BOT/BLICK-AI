import React, { useState } from 'react';
import {
  Bug,
  Film,
  Image as ImageIcon,
  Layout,
  LogIn,
  LogOut,
  MessageSquare,
  Mic,
  Moon,
  Sun,
} from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ChatWorkspace } from './components/ChatWorkspace';
import { WebsiteBuilder } from './components/WebsiteBuilder';
import { CodeDebugger } from './components/CodeDebugger';
import { ImageStudio } from './components/ImageStudio';
import { MotionStudio } from './components/MotionStudio';
import { VoiceStudio } from './components/VoiceStudio';
import { OfflineIndicator, PWAInstallButton } from './components/PWAControls';
import { WorkspaceTab } from './types/blick';

const NAV_ITEMS: Array<{
  id: WorkspaceTab;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'chat', label: 'AI Chat', shortLabel: 'Chat', icon: MessageSquare },
  { id: 'websites', label: 'Site Studio', shortLabel: 'Sites', icon: Layout },
  { id: 'debugger', label: 'Code Debugger', shortLabel: 'Debug', icon: Bug },
  { id: 'images', label: 'Image Studio', shortLabel: 'Images', icon: ImageIcon },
  { id: 'motion', label: 'Motion Video', shortLabel: 'Motion', icon: Film },
  { id: 'voice', label: 'Voice & Live', shortLabel: 'Voice', icon: Mic },
];

class WorkspaceErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0B0F19] p-6">
          <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Workspace Notice
            </h2>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="mt-4 min-h-[40px] rounded-xl bg-blue-600 px-5 py-2 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
            >
              Reload Workspace
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const BlickShell: React.FC = () => {
  const { user, authReady, authError, theme, toggleTheme, signInWithGoogle, logOut } = useAuth();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('chat');

  const [handoffSiteCode, setHandoffSiteCode] = useState('');
  const [handoffSitePrompt, setHandoffSitePrompt] = useState('');
  const [handoffDebugCode, setHandoffDebugCode] = useState('');
  const [handoffMotionImage, setHandoffMotionImage] = useState<string | null>(null);

  const activeNav = NAV_ITEMS.find((n) => n.id === activeTab) || NAV_ITEMS[0];

  return (
    <div className="h-dvh w-full flex flex-col bg-slate-50 text-slate-900 dark:bg-[#0B0F19] dark:text-slate-100 overflow-hidden">
      {/* Top Bar */}
      <header className="h-12 md:h-14 shrink-0 flex items-center justify-between gap-4 px-4 md:px-6 border-b border-slate-200 dark:border-slate-800/80 bg-white/90 dark:bg-[#0B0F19]/90 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <img
              src="/icon.svg"
              alt="Blick AI mark"
              className="w-6 h-6 rounded-md shrink-0"
            />
            <span className="font-display text-base md:text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              Blick AI
            </span>
          </div>
          <span className="hidden md:inline text-slate-300 dark:text-slate-700" aria-hidden="true">
            /
          </span>
          <span className="hidden md:inline text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
            {activeNav.label}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton compact />

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {!authReady ? null : user ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User avatar'}
                    referrerPolicy="no-referrer"
                    className="w-5 h-5 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {(user.displayName || user.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200 max-w-[120px] truncate">
                  {user.displayName || user.email}
                </span>
              </div>
              <button
                type="button"
                onClick={logOut}
                title="Sign out"
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={signInWithGoogle}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </header>

      {authError && (
        <div className="bg-red-600 text-white text-xs px-4 py-1.5 text-center">
          {authError}
        </div>
      )}

      {/* Body: Desktop Sidebar + Active Studio Viewport */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Desktop Navigation Sidebar */}
        <nav
          aria-label="Workspace Studios"
          className="hidden md:flex w-56 lg:w-60 shrink-0 flex-col justify-between border-r border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/60 p-3"
        >
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full min-h-[42px] flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400 px-2 space-y-1">
            <div className="font-medium text-slate-700 dark:text-slate-300">
              {user ? 'Cloud Sync Active' : 'Free Guest Access'}
            </div>
            <div>
              {user
                ? 'Chats & builds saved to your account.'
                : 'Sign in anytime to sync across devices.'}
            </div>
          </div>
        </nav>

        {/* Active Studio Viewport */}
        <main className="flex-1 min-w-0 min-h-0 overflow-hidden pb-14 md:pb-0">
          {activeTab === 'chat' && (
            <ChatWorkspace
              onSendToWebsiteBuilder={(code, prompt) => {
                setHandoffSiteCode(code);
                setHandoffSitePrompt(prompt);
                setActiveTab('websites');
              }}
              onSendToDebugger={(code) => {
                setHandoffDebugCode(code);
                setActiveTab('debugger');
              }}
            />
          )}
          {activeTab === 'websites' && (
            <WebsiteBuilder
              initialCode={handoffSiteCode}
              initialPrompt={handoffSitePrompt}
            />
          )}
          {activeTab === 'debugger' && <CodeDebugger initialCode={handoffDebugCode} />}
          {activeTab === 'images' && (
            <ImageStudio
              onSendToMotionStudio={(imgUrl) => {
                setHandoffMotionImage(imgUrl);
                setActiveTab('motion');
              }}
            />
          )}
          {activeTab === 'motion' && (
            <MotionStudio initialImageDataUrl={handoffMotionImage} />
          )}
          {activeTab === 'voice' && <VoiceStudio />}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 pb-safe grid grid-cols-6 items-center border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B0F19]/95 backdrop-blur-md"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
                isActive
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="truncate max-w-full px-1">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      <OfflineIndicator />
    </div>
  );
};

export default function App() {
  return (
    <WorkspaceErrorBoundary>
      <AuthProvider>
        <BlickShell />
      </AuthProvider>
    </WorkspaceErrorBoundary>
  );
}
