import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Film,
  ImagePlus,
  Loader2,
  Trash2,
} from 'lucide-react';
import { GeneratedVideoItem } from '../types/blick';

interface MotionStudioProps {
  initialImageDataUrl?: string | null;
}

const STARTER_LANDSCAPE = '/src/assets/images/motion_starter_landscape_1794639953092.jpg';

export const MotionStudio: React.FC<MotionStudioProps> = ({ initialImageDataUrl }) => {
  const [sourceImage, setSourceImage] = useState<{
    data: string;
    mimeType: string;
    previewUrl: string;
  } | null>(null);
  const [prompt, setPrompt] = useState(
    'Slow cinematic camera push forward as morning mist drifts across the still water.'
  );
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [duration, setDuration] = useState<'5s' | '6s' | '8s' | '10s'>('6s');

  const [videos, setVideos] = useState<GeneratedVideoItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadDataUrl = (dataUrl: string, mimeFallback = 'image/png') => {
    const [header, b64] = dataUrl.split(',');
    const mimeMatch = header?.match(/data:(.*?);/);
    setSourceImage({
      data: b64 || dataUrl,
      mimeType: mimeMatch?.[1] || mimeFallback,
      previewUrl: dataUrl,
    });
  };

  useEffect(() => {
    if (initialImageDataUrl) {
      loadDataUrl(initialImageDataUrl);
    }
  }, [initialImageDataUrl]);

  const loadSamplePhoto = async () => {
    try {
      const res = await fetch(STARTER_LANDSCAPE);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        loadDataUrl(String(reader.result || ''), blob.type || 'image/jpeg');
      };
      reader.readAsDataURL(blob);
    } catch {
      setErrorMsg('Could not load starter landscape image.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      loadDataUrl(String(reader.result || ''), file.type || 'image/png');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleAnimate = async () => {
    if (!sourceImage || !prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/video/animate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: sourceImage.data,
          mimeType: sourceImage.mimeType,
          prompt: prompt.trim(),
          aspectRatio,
          duration,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Video animation failed');

      setVideos((prev) => [
        {
          id: `vid_${Date.now()}`,
          prompt: prompt.trim(),
          videoDataUrl: data.videoDataUrl,
          aspectRatio: data.aspectRatio,
          createdAt: Date.now(),
        },
        ...prev,
      ]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to animate photo');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadVideo = (item: GeneratedVideoItem) => {
    const a = document.createElement('a');
    a.href = item.videoDataUrl;
    a.download = `blick-motion-${item.id}.mp4`;
    a.click();
  };

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/* Left Controls */}
      <aside className="w-full lg:w-96 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800/80 p-4 sm:p-5 overflow-y-auto space-y-5 bg-white/60 dark:bg-slate-950/40">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Motion &amp; Video Studio
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Animate any still photo into video using Gemini Omni 1.2 Flash
          </p>
        </div>

        {/* Upload Photo */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Starting Frame Photo
            </label>
            <button
              type="button"
              onClick={loadSamplePhoto}
              className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              Load Sample Landscape
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          {sourceImage ? (
            <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950">
              <img
                src={sourceImage.previewUrl}
                alt="Starting animation frame"
                referrerPolicy="no-referrer"
                className="w-full h-44 object-contain"
              />
              <button
                type="button"
                onClick={() => setSourceImage(null)}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 text-white hover:bg-black"
                aria-label="Clear photo"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-36 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center gap-2 text-xs text-slate-500 hover:border-blue-500 hover:text-blue-500 transition-colors cursor-pointer"
            >
              <ImagePlus className="w-6 h-6" />
              <span>Upload a photo to animate</span>
            </button>
          )}
        </div>

        {/* Aspect Ratio */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            Video Aspect Ratio
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAspectRatio('16:9')}
              className={`min-h-[40px] rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                aspectRatio === '16:9'
                  ? 'border-blue-500 bg-blue-600 text-white'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              }`}
            >
              16:9 Landscape
            </button>
            <button
              type="button"
              onClick={() => setAspectRatio('9:16')}
              className={`min-h-[40px] rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                aspectRatio === '9:16'
                  ? 'border-blue-500 bg-blue-600 text-white'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              }`}
            >
              9:16 Portrait
            </button>
          </div>
        </div>

        {/* Duration */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            Clip Duration
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {(['5s', '6s', '8s', '10s'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                className={`min-h-[36px] rounded-lg border text-xs font-mono cursor-pointer ${
                  duration === d
                    ? 'border-blue-500 bg-blue-600/15 text-blue-600 dark:text-blue-400 font-semibold'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Motion Prompt */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            Motion Direction
          </label>
          <textarea
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe camera movement, lighting shifts, or subject motion..."
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="button"
          onClick={handleAnimate}
          disabled={isGenerating || !sourceImage || !prompt.trim()}
          className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Animating Video...</span>
            </>
          ) : (
            <>
              <Film className="w-4 h-4" />
              <span>Animate Photo</span>
            </>
          )}
        </button>

        {isGenerating && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Generating video via Gemini Omni 1.2 Flash. This typically takes 30–90 seconds.
          </p>
        )}

        {errorMsg && (
          <div className="rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/60 p-3 text-xs text-red-700 dark:text-red-300">
            {errorMsg}
          </div>
        )}
      </aside>

      {/* Output Feed */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
        {videos.length === 0 ? (
          <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center max-w-lg mx-auto">
            <img
              src={STARTER_LANDSCAPE}
              alt="Alpine lake sample frame"
              referrerPolicy="no-referrer"
              className="w-full max-w-md aspect-video rounded-2xl object-cover border border-slate-200 dark:border-slate-800 mb-4"
            />
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Bring Still Photos to Life
            </h3>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              Upload any photo or start with the alpine landscape above, pick 16:9 landscape or 9:16 portrait, and animate with Gemini Omni 1.2 Flash.
            </p>
            <button
              type="button"
              onClick={loadSamplePhoto}
              className="mt-4 min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Use Sample Photo
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 max-w-3xl mx-auto">
            {videos.map((v) => (
              <div
                key={v.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
              >
                <div className="bg-black flex items-center justify-center">
                  <video
                    src={v.videoDataUrl}
                    controls
                    autoPlay
                    loop
                    playsInline
                    className={
                      v.aspectRatio === '9:16'
                        ? 'max-h-[520px] aspect-[9/16]'
                        : 'w-full aspect-video'
                    }
                  />
                </div>
                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      gemini-omni-1.2-flash · {v.aspectRatio}
                    </div>
                    <p className="mt-1 text-xs text-slate-800 dark:text-slate-200 truncate">
                      {v.prompt}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownloadVideo(v)}
                    className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download MP4</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
