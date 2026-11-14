import React, { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Download,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Send,
  Volume2,
} from 'lucide-react';

const VOICES = ['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir'] as const;

interface LiveTurn {
  id: string;
  speaker: 'You' | 'Blick AI';
  text: string;
}

function pcmFloat32ToBase64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64Pcm24kToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}

export const VoiceStudio: React.FC = () => {
  const [tab, setTab] = useState<'live' | 'tts'>('live');

  // Live API state
  const [liveVoice, setLiveVoice] = useState<(typeof VOICES)[number]>('Zephyr');
  const [liveStatus, setLiveStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [transcripts, setTranscripts] = useState<LiveTurn[]>([]);
  const [liveNudge, setLiveNudge] = useState('');
  const [liveError, setLiveError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isMutedRef = useRef(false);

  // TTS Studio state
  const [ttsVoice, setTtsVoice] = useState<(typeof VOICES)[number]>('Kore');
  const [ttsStyle, setTtsStyle] = useState('Clear, confident studio narrator');
  const [ttsText, setTtsText] = useState(
    'Welcome to Blick AI. You can chat across flagship models, build responsive websites, debug production code, and animate photos in one place.'
  );
  const [dualSpeaker, setDualSpeaker] = useState(false);
  const [secondVoice, setSecondVoice] = useState<(typeof VOICES)[number]>('Puck');
  const [secondText, setSecondText] = useState(
    'And every tool works seamlessly across desktop and mobile!'
  );
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [ttsError, setTtsError] = useState<string | null>(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const stopLiveSession = () => {
    try {
      processorRef.current?.disconnect();
      processorRef.current = null;
    } catch {}
    try {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    } catch {}
    try {
      inputCtxRef.current?.close();
      inputCtxRef.current = null;
    } catch {}
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {}
    });
    activeSourcesRef.current.clear();
    try {
      outputCtxRef.current?.close();
      outputCtxRef.current = null;
    } catch {}
    try {
      wsRef.current?.close();
      wsRef.current = null;
    } catch {}
    nextStartTimeRef.current = 0;
    setLiveStatus('idle');
  };

  useEffect(() => {
    return () => {
      stopLiveSession();
    };
  }, []);

  const appendTranscript = (speaker: 'You' | 'Blick AI', chunkText: string) => {
    if (!chunkText) return;
    setTranscripts((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker) {
        return [
          ...prev.slice(0, -1),
          { ...last, text: last.text + chunkText },
        ];
      }
      return [...prev, { id: `tr_${Date.now()}_${prev.length}`, speaker, text: chunkText }];
    });
  };

  const playPcmChunk = (base64Audio: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;
    const float32 = base64Pcm24kToFloat32(base64Audio);
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + buffer.duration;

    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
    };
  };

  const startLiveSession = async () => {
    if (liveStatus !== 'idle') return;
    setLiveError(null);
    setLiveStatus('connecting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/live?voice=${liveVoice}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.ready) {
          setLiveStatus('connected');
        }
        if (msg.error) {
          setLiveError(msg.error);
          stopLiveSession();
        }
        if (msg.audio) {
          playPcmChunk(msg.audio);
        }
        if (msg.interrupted) {
          activeSourcesRef.current.forEach((s) => {
            try {
              s.stop();
            } catch {}
          });
          activeSourcesRef.current.clear();
          if (outputCtxRef.current) {
            nextStartTimeRef.current = outputCtxRef.current.currentTime;
          }
        }
        if (msg.inputTranscript) {
          appendTranscript('You', msg.inputTranscript);
        }
        if (msg.outputTranscript) {
          appendTranscript('Blick AI', msg.outputTranscript);
        }
      };

      ws.onerror = () => {
        setLiveError('WebSocket connection failed. Please retry.');
        stopLiveSession();
      };

      ws.onclose = () => {
        stopLiveSession();
      };

      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (isMutedRef.current) return;
        if (ws.readyState !== WebSocket.OPEN) return;
        const channelData = e.inputBuffer.getChannelData(0);
        const base64 = pcmFloat32ToBase64(channelData);
        ws.send(JSON.stringify({ audio: base64 }));
      };

      source.connect(processor);
      processor.connect(inputCtx.destination);
    } catch (err) {
      setLiveError(
        err instanceof Error
          ? err.message
          : 'Microphone access is required for Live Voice.'
      );
      stopLiveSession();
    }
  };

  const sendLiveTextNudge = () => {
    if (!liveNudge.trim() || wsRef.current?.readyState !== WebSocket.OPEN) return;
    const text = liveNudge.trim();
    wsRef.current.send(JSON.stringify({ text }));
    appendTranscript('You', text);
    setLiveNudge('');
  };

  const handleGenerateTTS = async () => {
    if (!ttsText.trim() || ttsLoading) return;
    setTtsLoading(true);
    setTtsError(null);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: ttsText,
          voiceName: ttsVoice,
          style: ttsStyle,
          dualSpeaker,
          secondSpeakerText: secondText,
          secondVoiceName: secondVoice,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'TTS failed');
      setTtsAudioUrl(data.audioDataUrl);
    } catch (err) {
      setTtsError(err instanceof Error ? err.message : 'Unable to generate speech');
    } finally {
      setTtsLoading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Sub-navigation */}
      <div className="border-b border-slate-200 dark:border-slate-800/80 bg-white/70 dark:bg-slate-950/60 px-4 py-2.5 sm:px-6 flex items-center justify-between gap-4">
        <div className="inline-flex rounded-xl bg-slate-200/80 dark:bg-slate-900 p-1">
          <button
            type="button"
            onClick={() => setTab('live')}
            className={`min-h-[36px] inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
              tab === 'live'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Live Voice</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('tts')}
            className={`min-h-[36px] inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
              tab === 'tts'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Text-to-Speech</span>
          </button>
        </div>

        <span className="hidden sm:inline text-xs font-mono text-slate-500 dark:text-slate-400">
          {tab === 'live' ? 'gemini-3.8-live' : 'gemini-3.8-flash-tts'}
        </span>
      </div>

      {tab === 'live' ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-between p-4 sm:p-8 overflow-y-auto">
          <div className="w-full max-w-2xl flex flex-col items-center text-center pt-4">
            <div
              className={`h-28 w-28 rounded-full flex items-center justify-center border transition-all ${
                liveStatus === 'connected'
                  ? 'border-blue-500 bg-blue-600/15 text-blue-500 scale-105'
                  : liveStatus === 'connecting'
                  ? 'border-amber-500 bg-amber-500/10 text-amber-500'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 text-slate-500'
              }`}
            >
              {liveStatus === 'connecting' ? (
                <Loader2 className="w-10 h-10 animate-spin" />
              ) : (
                <AudioLines className="w-10 h-10" />
              )}
            </div>

            <h2 className="mt-5 text-xl font-semibold text-slate-900 dark:text-white">
              {liveStatus === 'connected'
                ? 'Live Voice Active'
                : liveStatus === 'connecting'
                ? 'Connecting Session...'
                : 'Real-Time Voice Conversation'}
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md">
              Speak naturally with Gemini 3.8 Live. Supports instant interruption, bidirectional audio, and live transcripts.
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <select
                value={liveVoice}
                disabled={liveStatus !== 'idle'}
                onChange={(e) => setLiveVoice(e.target.value as (typeof VOICES)[number])}
                aria-label="Live Voice Persona"
                className="min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 disabled:opacity-50"
              >
                {VOICES.map((v) => (
                  <option key={v} value={v}>
                    Voice: {v}
                  </option>
                ))}
              </select>

              {liveStatus === 'idle' ? (
                <button
                  type="button"
                  onClick={startLiveSession}
                  className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                  <span>Start Voice Call</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setIsMuted((m) => !m)}
                    className={`min-h-[42px] inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-medium cursor-pointer ${
                      isMuted
                        ? 'border-amber-500 bg-amber-500/15 text-amber-500'
                        : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    <span>{isMuted ? 'Unmute' : 'Mute Mic'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopLiveSession}
                    className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700 cursor-pointer"
                  >
                    <PhoneOff className="w-4 h-4" />
                    <span>End Call</span>
                  </button>
                </>
              )}
            </div>

            {liveError && (
              <div className="mt-4 w-full max-w-lg rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/60 px-4 py-2.5 text-xs text-red-700 dark:text-red-300">
                {liveError}
              </div>
            )}
          </div>

          {/* Live Transcripts */}
          <div className="w-full max-w-2xl mt-6 space-y-3">
            {transcripts.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2.5 text-left">
                {transcripts.map((t) => (
                  <div key={t.id} className="text-xs">
                    <span className="font-semibold text-slate-900 dark:text-white mr-2">
                      {t.speaker}:
                    </span>
                    <span className="text-slate-700 dark:text-slate-300">{t.text}</span>
                  </div>
                ))}
              </div>
            )}

            {liveStatus === 'connected' && (
              <div className="flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5">
                <input
                  type="text"
                  value={liveNudge}
                  onChange={(e) => setLiveNudge(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') sendLiveTextNudge();
                  }}
                  placeholder="Type a message during your live voice session..."
                  className="flex-1 bg-transparent px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={sendLiveTextNudge}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-8">
          <div className="mx-auto max-w-2xl space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Text-to-Speech Studio
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Studio narration and dual-speaker dialogue powered by Gemini 3.8 Flash TTS
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setDualSpeaker(false)}
                className={`min-h-[36px] rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer ${
                  !dualSpeaker
                    ? 'border-blue-500 bg-blue-600 text-white'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                Single Narrator
              </button>
              <button
                type="button"
                onClick={() => setDualSpeaker(true)}
                className={`min-h-[36px] rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer ${
                  dualSpeaker
                    ? 'border-blue-500 bg-blue-600 text-white'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                Dual-Speaker Dialogue
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  {dualSpeaker ? 'Speaker A Voice' : 'Voice'}
                </label>
                <select
                  value={ttsVoice}
                  onChange={(e) => setTtsVoice(e.target.value as (typeof VOICES)[number])}
                  className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs text-slate-900 dark:text-slate-100"
                >
                  {VOICES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              {dualSpeaker ? (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Speaker B Voice
                  </label>
                  <select
                    value={secondVoice}
                    onChange={(e) => setSecondVoice(e.target.value as (typeof VOICES)[number])}
                    className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs text-slate-900 dark:text-slate-100"
                  >
                    {VOICES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Voice Style / Persona
                  </label>
                  <input
                    type="text"
                    value={ttsStyle}
                    onChange={(e) => setTtsStyle(e.target.value)}
                    placeholder="Warm, articulate studio narrator"
                    className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                {dualSpeaker ? 'Speaker A Script' : 'Script to Speak'}
              </label>
              <textarea
                rows={4}
                value={ttsText}
                onChange={(e) => setTtsText(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {dualSpeaker && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Speaker B Script
                </label>
                <textarea
                  rows={3}
                  value={secondText}
                  onChange={(e) => setSecondText(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleGenerateTTS}
              disabled={ttsLoading || !ttsText.trim()}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer"
            >
              {ttsLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Synthesizing Audio...</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" />
                  <span>Generate Speech</span>
                </>
              )}
            </button>

            {ttsError && (
              <div className="rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/60 p-3 text-xs text-red-700 dark:text-red-300">
                {ttsError}
              </div>
            )}

            {ttsAudioUrl && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <audio src={ttsAudioUrl} controls autoPlay className="flex-1 h-10" />
                <a
                  href={ttsAudioUrl}
                  download={`blick-tts-${Date.now()}.wav`}
                  className="min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download WAV</span>
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
