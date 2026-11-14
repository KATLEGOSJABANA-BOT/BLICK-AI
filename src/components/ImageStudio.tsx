import React, { useRef, useState } from 'react';
import {
  Download,
  Film,
  ImagePlus,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { GeneratedImageItem } from '../types/blick';

interface ImageStudioProps {
  onSendToMotionStudio: (imageDataUrl: string) => void;
}

const STARTER_EDIT_IMAGE = '/src/assets/images/edit_starter_studio_1794639953984.jpg';

export const ImageStudio: React.FC<ImageStudioProps> = ({ onSendToMotionStudio }) => {
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [engine, setEngine] = useState<'gemini-nano-banana-2.1' | 'gemini-3-pro-image-preview'>(
    'gemini-nano-banana-2.1'
  );
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '16:9' | '9:16' | '4:3' | '3:4'>('1:1');
  const [prompt, setPrompt] = useState('');

  const [sourceImage, setSourceImage] = useState<{
    data: string;
    mimeType: string;
    previewUrl: string;
  } | null>(null);

  const [gallery, setGallery] = useState<GeneratedImageItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadImageUrlAsSource = async (url: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        setSourceImage({
          data: base64,
          mimeType: blob.type || 'image/jpeg',
          previewUrl: result,
        });
        setMode('edit');
        setEngine('gemini-nano-banana-2.1');
      };
      reader.readAsDataURL(blob);
    } catch {
      setErrorMsg('Unable to load image for editing.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      setSourceImage({
        data: base64,
        mimeType: file.type || 'image/png',
        previewUrl: result,
      });
      setMode('edit');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    if (mode === 'edit' && !sourceImage) {
      setErrorMsg('Please upload or choose a source photo to edit.');
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const activeModel =
        mode === 'edit' ? 'gemini-nano-banana-2.1' : engine;

      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model: activeModel,
          aspectRatio,
          imageSize,
          sourceImage:
            mode === 'edit' && sourceImage
              ? { data: sourceImage.data, mimeType: sourceImage.mimeType }
              : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Image generation failed');

      const newItem: GeneratedImageItem = {
        id: `img_${Date.now()}`,
        prompt: prompt.trim(),
        imageUrl: data.imageUrl,
        caption: data.caption,
        model: data.model,
        imageSize: data.imageSize,
        aspectRatio: data.aspectRatio,
        createdAt: Date.now(),
      };
      setGallery((prev) => [newItem, ...prev]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to generate image');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = (item: GeneratedImageItem) => {
    const a = document.createElement('a');
    a.href = item.imageUrl;
    a.download = `blick-ai-${item.imageSize.toLowerCase()}-${item.id}.png`;
    a.click();
  };

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/* Controls Panel */}
      <aside className="w-full lg:w-96 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800/80 p-4 sm:p-5 overflow-y-auto space-y-5 bg-white/60 dark:bg-slate-950/40">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Image Studio
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Create &amp; edit images or render high-resolution 1K, 2K, and 4K visuals
          </p>
        </div>

        {/* Mode Switch */}
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200/80 dark:bg-slate-900 p-1">
          <button
            type="button"
            onClick={() => setMode('create')}
            className={`min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              mode === 'create'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Create Image</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('edit');
              setEngine('gemini-nano-banana-2.1');
            }}
            className={`min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              mode === 'edit'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Edit Photo</span>
          </button>
        </div>

        {/* Model Selector */}
        {mode === 'create' && (
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Generation Model
            </label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setEngine('gemini-nano-banana-2.1')}
                className={`w-full text-left rounded-xl border p-3 transition-colors cursor-pointer ${
                  engine === 'gemini-nano-banana-2.1'
                    ? 'border-blue-500 bg-blue-600/10'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                }`}
              >
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  Nano Banana 2.1
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  gemini-nano-banana-2.1 · Fast creation &amp; natural edits
                </div>
              </button>

              <button
                type="button"
                onClick={() => setEngine('gemini-3-pro-image-preview')}
                className={`w-full text-left rounded-xl border p-3 transition-colors cursor-pointer ${
                  engine === 'gemini-3-pro-image-preview'
                    ? 'border-blue-500 bg-blue-600/10'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                }`}
              >
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  Gemini 3 Pro Image
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  gemini-3-pro-image-preview · High-detail 1K / 2K / 4K
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Resolution Selector (1K, 2K, 4K) */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            Output Resolution
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['1K', '2K', '4K'] as const).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => setImageSize(sz)}
                className={`min-h-[38px] rounded-lg border text-xs font-mono font-medium transition-colors cursor-pointer ${
                  imageSize === sz
                    ? 'border-blue-500 bg-blue-600 text-white'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                }`}
              >
                {sz}
              </button>
            ))}
          </div>
        </div>

        {/* Aspect Ratio */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            Aspect Ratio
          </label>
          <div className="grid grid-cols-5 gap-1.5">
            {(['1:1', '16:9', '9:16', '4:3', '3:4'] as const).map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => setAspectRatio(ratio)}
                className={`min-h-[36px] rounded-lg border text-xs font-mono transition-colors cursor-pointer ${
                  aspectRatio === ratio
                    ? 'border-blue-500 bg-blue-600/15 text-blue-600 dark:text-blue-400 font-semibold'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>

        {/* Source Photo Upload (Edit Mode) */}
        {mode === 'edit' && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Source Image
              </label>
              <button
                type="button"
                onClick={() => loadImageUrlAsSource(STARTER_EDIT_IMAGE)}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Use Sample Photo
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            {sourceImage ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950">
                <img
                  src={sourceImage.previewUrl}
                  alt="Source for editing"
                  referrerPolicy="no-referrer"
                  className="w-full h-40 object-contain"
                />
                <button
                  type="button"
                  onClick={() => setSourceImage(null)}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 text-white hover:bg-black"
                  aria-label="Remove source image"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-28 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center gap-1.5 text-xs text-slate-500 hover:border-blue-500 hover:text-blue-500 transition-colors cursor-pointer"
              >
                <ImagePlus className="w-5 h-5" />
                <span>Upload photo to edit</span>
              </button>
            )}
          </div>
        )}

        {/* Prompt */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            {mode === 'edit' ? 'Edit Instruction' : 'Image Prompt'}
          </label>
          <textarea
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              mode === 'edit'
                ? 'Replace the background with a misty Tokyo street at dusk, warm reflections...'
                : 'Architectural studio render of a titanium audio amplifier on warm slate...'
            }
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Rendering {imageSize}...</span>
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4" />
              <span>{mode === 'edit' ? 'Apply Edit' : `Generate (${imageSize})`}</span>
            </>
          )}
        </button>

        {errorMsg && (
          <div className="rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/60 p-3 text-xs text-red-700 dark:text-red-300">
            {errorMsg}
          </div>
        )}
      </aside>

      {/* Gallery Canvas */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
        {gallery.length === 0 ? (
          <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center max-w-md mx-auto">
            <img
              src={STARTER_EDIT_IMAGE}
              alt="Studio sample reference"
              referrerPolicy="no-referrer"
              className="w-48 h-48 rounded-2xl object-cover border border-slate-200 dark:border-slate-800 mb-4"
            />
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Ready to Create or Edit
            </h3>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              Generate crisp visuals in 1K, 2K, or 4K with Gemini 3 Pro Image, or upload any photo to edit with Nano Banana 2.1.
            </p>
            <button
              type="button"
              onClick={() => loadImageUrlAsSource(STARTER_EDIT_IMAGE)}
              className="mt-4 min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Load Sample Photo into Editor
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {gallery.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
              >
                <div className="bg-slate-950 flex items-center justify-center">
                  <img
                    src={item.imageUrl}
                    alt={item.prompt}
                    referrerPolicy="no-referrer"
                    className="w-full max-h-[420px] object-contain"
                  />
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono">{item.model}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{item.imageSize}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{item.aspectRatio}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-800 dark:text-slate-200 line-clamp-2">
                    {item.prompt}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownload(item)}
                      className="min-h-[34px] inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => loadImageUrlAsSource(item.imageUrl)}
                      className="min-h-[34px] inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSendToMotionStudio(item.imageUrl)}
                      className="min-h-[34px] inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Film className="w-3.5 h-3.5" />
                      <span>Animate</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
