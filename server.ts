import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  ThinkingLevel,
  Type,
} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

function createAiClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getReadableErrorMessage(error: unknown): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();
  if (lower.includes('api_key_invalid') || lower.includes('permission_denied') || lower.includes('403')) {
    return {
      status: 403,
      message: 'API key missing or rejected. Please verify GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (lower.includes('resource_exhausted') || lower.includes('429') || lower.includes('quota')) {
    return {
      status: 429,
      message:
        'Rate limit or quota reached for this model. Select a billing-enabled API key in Settings > Secrets or switch to Gemini 4 Hydrogen.',
    };
  }
  if (lower.includes('not_found') || lower.includes('404')) {
    return {
      status: 404,
      message: `Requested model is unavailable (${raw}). Try switching models.`,
    };
  }
  return { status: 500, message: raw || 'Unexpected server error while calling AI service.' };
}

const ALLOWED_CHAT_MODELS = new Set([
  'gemini-4-hydrogen',
  'gemini-4-argon',
  'gemini-4-carbon',
]);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '30mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'blick-ai' });
  });

  // 1. Streaming Multi-Turn Chat
  app.post('/api/chat', async (req, res) => {
    try {
      const {
        messages = [],
        model = 'gemini-4-hydrogen',
        thinkingLevel = 'HIGH',
        useSearch = false,
        persona = 'balanced',
      } = req.body as {
        messages: Array<{
          role: 'user' | 'assistant';
          text: string;
          attachment?: { data: string; mimeType: string };
        }>;
        model?: string;
        thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';
        useSearch?: boolean;
        persona?: 'balanced' | 'concise' | 'architect';
      };

      const selectedModel = ALLOWED_CHAT_MODELS.has(model) ? model : 'gemini-4-hydrogen';

      const personaGuide =
        persona === 'concise'
          ? 'Keep explanations crisp, direct, and scannable with bullet points and minimal filler.'
          : persona === 'architect'
          ? 'Respond like a principal software architect and systems thinker: evaluate trade-offs, edge cases, complexity, and concrete implementation details.'
          : 'Combine clarity, structured reasoning, and practical depth. Format code cleanly with language tags and use Markdown tables or numbered steps when helpful.';

      const systemInstruction = `You are Blick AI, a unified multimodal intelligence studio. ${personaGuide}`;

      const contents = messages.map((m) => {
        const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [];
        if (m.attachment?.data && m.attachment?.mimeType) {
          parts.push({
            inlineData: {
              data: m.attachment.data,
              mimeType: m.attachment.mimeType,
            },
          });
        }
        parts.push({ text: m.text || ' ' });
        return {
          role: m.role === 'assistant' ? 'model' : 'user',
          parts,
        };
      });

      let resolvedThinking: ThinkingLevel = ThinkingLevel.HIGH;
      if (thinkingLevel === 'LOW') resolvedThinking = ThinkingLevel.LOW;
      else if (thinkingLevel === 'MEDIUM') resolvedThinking = ThinkingLevel.MEDIUM;
      else if (thinkingLevel === 'XHIGH') {
        resolvedThinking =
          selectedModel === 'gemini-4-hydrogen' ? ThinkingLevel.XHIGH : ThinkingLevel.HIGH;
      }

      const ai = createAiClient();

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const config: Record<string, unknown> = {
        systemInstruction,
        thinkingConfig: { thinkingLevel: resolvedThinking },
      };

      if (useSearch) {
        config.tools = [{ googleSearch: {} }];
      }

      const stream = await ai.models.generateContentStream({
        model: selectedModel,
        contents,
        config,
      });

      const collectedSources: Array<{ title: string; url: string }> = [];
      const seenUrls = new Set<string>();

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }

        const groundingChunks =
          chunk.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
        for (const g of groundingChunks) {
          const uri = g.web?.uri;
          const title = g.web?.title || uri;
          if (uri && !seenUrls.has(uri)) {
            seenUrls.add(uri);
            collectedSources.push({ title: title || uri, url: uri });
          }
        }
      }

      if (collectedSources.length > 0) {
        res.write(`data: ${JSON.stringify({ sources: collectedSources })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      const { status, message } = getReadableErrorMessage(error);
      if (!res.headersSent) {
        res.status(status).json({ error: message });
      } else {
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        res.end();
      }
    }
  });

  // 2. Website Builder
  app.post('/api/website', async (req, res) => {
    try {
      const {
        prompt,
        currentCode = '',
        stylePreset = 'Editorial Modern',
        model = 'gemini-4-argon',
      } = req.body as {
        prompt: string;
        currentCode?: string;
        stylePreset?: string;
        model?: string;
      };

      if (!prompt || !prompt.trim()) {
        res.status(400).json({ error: 'Please describe the website you want to build.' });
        return;
      }

      const selectedModel =
        model === 'gemini-4-hydrogen' ? 'gemini-4-hydrogen' : 'gemini-4-argon';

      const ai = createAiClient();

      const fullPrompt = currentCode.trim()
        ? `Update the existing HTML website based on this instruction: "${prompt}"\nStyle direction: ${stylePreset}.\n\nExisting HTML:\n${currentCode}`
        : `Build a complete, polished, production-grade responsive website for: "${prompt}".\nVisual style direction: ${stylePreset}.`;

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: fullPrompt,
        config: {
          systemInstruction:
            'You are an elite frontend architect. Output a complete, self-contained single-file HTML5 document using Tailwind CSS via <script src="https://cdn.tailwindcss.com"></script> and Google Fonts. Include rich real copy, responsive mobile + desktop navigation, interactive client-side JavaScript (modals, tabs, forms, filters where relevant), crisp inline SVGs for icons/illustrations (NEVER use broken external image URLs like unsplash or placeholder.com), and clean accessibility contrast.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: 'Short 2-5 word website title.' },
              summary: {
                type: Type.STRING,
                description: 'Brief summary of layout, sections, and interactive features built.',
              },
              html: {
                type: Type.STRING,
                description: 'Complete valid standalone <!DOCTYPE html> document.',
              },
            },
            required: ['title', 'summary', 'html'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (error) {
      const { status, message } = getReadableErrorMessage(error);
      res.status(status).json({ error: message });
    }
  });

  // 3. Code Debugger
  app.post('/api/debug', async (req, res) => {
    try {
      const {
        code,
        errorLog = '',
        language = 'Auto-detect',
        goal = '',
      } = req.body as {
        code: string;
        errorLog?: string;
        language?: string;
        goal?: string;
      };

      if (!code || !code.trim()) {
        res.status(400).json({ error: 'Please paste code to analyze and debug.' });
        return;
      }

      const ai = createAiClient();

      const debugPrompt = [
        `Language: ${language}`,
        goal ? `Expected behavior / goal: ${goal}` : '',
        errorLog ? `Error message / stack trace:\n${errorLog}` : '',
        `Source code:\n\`\`\`\n${code}\n\`\`\``,
      ]
        .filter(Boolean)
        .join('\n\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-carbon',
        contents: debugPrompt,
        config: {
          systemInstruction:
            'You are a principal software reliability and security debugger. Analyze the provided code thoroughly, pinpoint root causes, race conditions, type errors, memory leaks, logic bugs, and security vulnerabilities, and return a complete drop-in fixed version of the code.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              rootCause: { type: Type.STRING },
              severity: { type: Type.STRING },
              detectedLanguage: { type: Type.STRING },
              issues: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    lineHint: { type: Type.STRING },
                    category: { type: Type.STRING },
                    description: { type: Type.STRING },
                    fixExplanation: { type: Type.STRING },
                  },
                  required: ['lineHint', 'category', 'description', 'fixExplanation'],
                },
              },
              fixedCode: { type: Type.STRING },
              verificationSteps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'summary',
              'rootCause',
              'severity',
              'detectedLanguage',
              'issues',
              'fixedCode',
              'verificationSteps',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (error) {
      const { status, message } = getReadableErrorMessage(error);
      res.status(status).json({ error: message });
    }
  });

  // 4. Image Creation & Editing (gemini-nano-banana-2.1 & gemini-3-pro-image-preview)
  app.post('/api/image', async (req, res) => {
    try {
      const {
        prompt,
        model = 'gemini-nano-banana-2.1',
        aspectRatio = '1:1',
        imageSize = '1K',
        sourceImage,
      } = req.body as {
        prompt: string;
        model?: 'gemini-nano-banana-2.1' | 'gemini-3-pro-image-preview';
        aspectRatio?: string;
        imageSize?: '1K' | '2K' | '4K';
        sourceImage?: { data: string; mimeType: string };
      };

      if (!prompt || !prompt.trim()) {
        res.status(400).json({ error: 'Please enter an image prompt.' });
        return;
      }

      const ai = createAiClient();

      const parts: Array<
        { text: string } | { inlineData: { data: string; mimeType: string } }
      > = [];
      if (sourceImage?.data && sourceImage?.mimeType) {
        parts.push({
          inlineData: {
            data: sourceImage.data,
            mimeType: sourceImage.mimeType,
          },
        });
      }
      parts.push({ text: prompt });

      const chosenModel =
        model === 'gemini-3-pro-image-preview'
          ? 'gemini-3-pro-image-preview'
          : 'gemini-nano-banana-2.1';

      const response = await ai.models.generateContent({
        model: chosenModel,
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio,
            imageSize,
          },
        },
      });

      let imageUrl: string | null = null;
      let caption = '';
      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType ?? 'image/png';
          imageUrl = `data:${mime};base64,${part.inlineData.data}`;
        } else if (part.text) {
          caption += part.text;
        }
      }

      if (!imageUrl) {
        res.status(502).json({
          error: caption || 'Model did not return an image. Try refining your prompt.',
        });
        return;
      }

      res.json({ imageUrl, caption, model: chosenModel, imageSize, aspectRatio });
    } catch (error) {
      const { status, message } = getReadableErrorMessage(error);
      res.status(status).json({ error: message });
    }
  });

  // 5. Animate Image into Video (gemini-omni-1.2-flash via Interactions API)
  app.post('/api/video/animate', async (req, res) => {
    try {
      const {
        imageData,
        mimeType = 'image/png',
        prompt,
        aspectRatio = '16:9',
        duration = '6s',
      } = req.body as {
        imageData: string;
        mimeType?: string;
        prompt: string;
        aspectRatio?: '16:9' | '9:16';
        duration?: string;
      };

      if (!imageData) {
        res.status(400).json({ error: 'Please upload or select a photo to animate.' });
        return;
      }
      if (!prompt || !prompt.trim()) {
        res.status(400).json({ error: 'Please describe how the photo should move or animate.' });
        return;
      }

      const ai = createAiClient();
      const targetRatio = aspectRatio === '9:16' ? '9:16' : '16:9';

      const interaction = await ai.interactions.create(
        {
          model: 'gemini-omni-1.2-flash',
          input: [
            {
              type: 'image',
              mime_type: mimeType,
              data: imageData,
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: targetRatio,
            duration,
          },
        },
        { timeout: 300000 }
      );

      const videoPart = interaction.output_video;
      if (videoPart?.data) {
        const videoMime = videoPart.mime_type || 'video/mp4';
        res.json({
          videoDataUrl: `data:${videoMime};base64,${videoPart.data}`,
          mimeType: videoMime,
          aspectRatio: targetRatio,
        });
        return;
      }

      if (videoPart?.uri) {
        const fetched = await fetch(videoPart.uri, {
          headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY || '' },
        });
        if (!fetched.ok) {
          throw new Error(`Failed to fetch generated video asset (${fetched.status})`);
        }
        const buf = Buffer.from(await fetched.arrayBuffer());
        const videoMime = videoPart.mime_type || 'video/mp4';
        res.json({
          videoDataUrl: `data:${videoMime};base64,${buf.toString('base64')}`,
          mimeType: videoMime,
          aspectRatio: targetRatio,
        });
        return;
      }

      res.status(502).json({ error: 'Video generation completed without a playable video output.' });
    } catch (error) {
      const { status, message } = getReadableErrorMessage(error);
      res.status(status).json({ error: message });
    }
  });

  // 6. Text-to-Speech (gemini-3.8-flash-tts)
  app.post('/api/tts', async (req, res) => {
    try {
      const {
        text,
        voiceName = 'Kore',
        style = 'Clear, natural, articulate studio narrator',
        dualSpeaker = false,
        secondSpeakerText = '',
        secondVoiceName = 'Puck',
      } = req.body as {
        text: string;
        voiceName?: string;
        style?: string;
        dualSpeaker?: boolean;
        secondSpeakerText?: string;
        secondVoiceName?: string;
      };

      if (!text || !text.trim()) {
        res.status(400).json({ error: 'Please provide text to convert to speech.' });
        return;
      }

      const ai = createAiClient();

      if (dualSpeaker && secondSpeakerText.trim()) {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Speaker A: ${text.trim()}`,
                  speechMetadata: {
                    speaker: 'Speaker A',
                    style: style || 'Engaging, warm host',
                  },
                },
                {
                  text: `Speaker B: ${secondSpeakerText.trim()}`,
                  speechMetadata: {
                    speaker: 'Speaker B',
                    style: 'Thoughtful, articulate co-host',
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              multiSpeakerVoiceConfig: {
                speakerVoiceConfigs: [
                  {
                    speaker: 'Speaker A',
                    voiceConfig: { prebuiltVoiceConfig: { voiceName } },
                  },
                  {
                    speaker: 'Speaker B',
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: secondVoiceName } },
                  },
                ],
              },
            },
          },
        });

        const base64Audio =
          response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
          res.status(502).json({ error: 'No audio returned from TTS model.' });
          return;
        }
        res.json({ audioDataUrl: `data:audio/wav;base64,${base64Audio}` });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: text.trim().slice(0, 6000),
                speechMetadata: {
                  style: style || 'Clear, natural, articulate voice',
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({ error: 'No audio returned from TTS model.' });
        return;
      }

      res.json({ audioDataUrl: `data:audio/wav;base64,${base64Audio}` });
    } catch (error) {
      const { status, message } = getReadableErrorMessage(error);
      res.status(status).json({ error: message });
    }
  });

  // Frontend serving (Vite dev middleware in dev, static dist in production)
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = http.createServer(app);

  // 7. WebSocket bridge for Gemini Live API (gemini-3.8-live)
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const reqUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (reqUrl.pathname === '/ws/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', async (clientWs: WebSocket, req) => {
    const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const voiceName = reqUrl.searchParams.get('voice') || 'Zephyr';

    let session: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
    try {
      const ai = createAiClient();
      session = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction:
            'You are Blick AI, a sharp, helpful real-time voice assistant. Keep spoken answers clear, conversational, and concise unless asked for deep detail.',
        },
        callbacks: {
          onopen: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ ready: true }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ inputTranscript: content.inputTranscription.text })
              );
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ outputTranscript: content.outputTranscription.text })
              );
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ turnComplete: true }));
            }
          },
          onerror: (err: unknown) => {
            if (clientWs.readyState === WebSocket.OPEN) {
              const msg = err instanceof Error ? err.message : 'Live session error';
              clientWs.send(JSON.stringify({ error: msg }));
            }
          },
          onclose: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ closed: true }));
            }
          },
        },
      });
    } catch (error) {
      const { message } = getReadableErrorMessage(error);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ error: message }));
        clientWs.close();
      }
      return;
    }

    clientWs.on('message', (rawData) => {
      if (!session) return;
      try {
        const parsed = JSON.parse(rawData.toString());
        if (parsed.audio) {
          session.sendRealtimeInput({
            audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (parsed.text) {
          session.sendRealtimeInput({ text: parsed.text });
        }
      } catch {
        // Ignore malformed frames
      }
    });

    clientWs.on('close', () => {
      try {
        session?.close();
      } catch {
        // Ignore close errors
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Blick AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Blick AI server:', err);
  process.exit(1);
});
