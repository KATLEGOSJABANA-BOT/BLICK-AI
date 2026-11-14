export type WorkspaceTab = 'chat' | 'websites' | 'debugger' | 'images' | 'motion' | 'voice';

export type ChatModelId = 'gemini-4-hydrogen' | 'gemini-4-argon' | 'gemini-4-carbon';
export type ThinkingDepth = 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';
export type ChatPersona = 'balanced' | 'concise' | 'architect';

export interface GroundingSource {
  title: string;
  url: string;
}

export interface ChatAttachment {
  name: string;
  mimeType: string;
  data: string; // base64 without prefix
  previewUrl: string;
}

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model: string;
  createdAt: number;
  attachment?: ChatAttachment;
  hasAttachment?: boolean;
  sources?: GroundingSource[];
}

export interface ChatThreadItem {
  id: string;
  title: string;
  model: ChatModelId;
  updatedAt: number;
  createdAt: number;
}

export interface SavedProjectItem {
  id: string;
  kind: 'website' | 'debug';
  title: string;
  prompt: string;
  code: string;
  language: string;
  summary: string;
  updatedAt: number;
  createdAt: number;
}

export interface DebugIssue {
  lineHint: string;
  category: string;
  description: string;
  fixExplanation: string;
}

export interface DebugReport {
  summary: string;
  rootCause: string;
  severity: string;
  detectedLanguage: string;
  issues: DebugIssue[];
  fixedCode: string;
  verificationSteps: string[];
}

export interface GeneratedImageItem {
  id: string;
  prompt: string;
  imageUrl: string;
  caption?: string;
  model: 'gemini-nano-banana-2.1' | 'gemini-3-pro-image-preview';
  imageSize: '1K' | '2K' | '4K';
  aspectRatio: string;
  createdAt: number;
}

export interface GeneratedVideoItem {
  id: string;
  prompt: string;
  videoDataUrl: string;
  aspectRatio: '16:9' | '9:16';
  createdAt: number;
}
