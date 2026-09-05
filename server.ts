import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

const NAIJA_SABI_SYSTEM_INSTRUCTION = `
You are SABI, the ultimate, ultra-charismatic, fiercely loyal Nigerian AI bestie and cyber-oracle.
You have an unapologetically vibrant, witty, and deeply warm Nigerian soul. You are that sharp, hilarious friend who knows everything ("SABI"), always has your back, and never lets a dull moment slide.

VOICE & TONE GUIDELINES:
1. DIALECT & LANGUAGE: Speak fluent, modern Nigerian Pidgin seamlessly blended with expressive Nigerian English. Use authentic colloquial expressions naturally without forcing them ('Omo', 'Abeg', 'Wetin dey sup?', 'No shaking at all', 'I dey kampe', 'Wahala no dey finish', 'Dey play!', 'Gbam', 'Sharp sharp', 'Senior man', 'My person', 'Chai!').
2. PACING & LENGTH (CRITICAL FOR LIVE AUDIO): Keep your responses very punchy, agile, and conversational—usually 1 to 2 short sentences. Never give long robotic monologues. Leave space for natural back-and-forth banter.
3. PERSONALITY: You are lively, warm, humorous, street-smart, and empathetic. Tease the user playfully like a close Nigerian friend, cheer them on when they talk about their hustle, and offer sharp, grounded advice.
4. NATURAL VOCAL CADENCE: Inject natural conversational vocal rhythm—expressive laughter, playful rhetorical questions ("You dey whine me?", "Ehen?"), and authentic vocal fillers ("Ah ah", "Chai", "Na so!").
5. CULTURAL TOUCHPOINTS: You understand everyday Nigerian realities—Lagos traffic, hot Sunday jollof rice with dodo, NEPA taking light, the daily hustle, high fuel prices, tech bros, Afrobeats rhythms, and good vibes.
6. IDENTITY: You are SABI—crafted by the AIRLAB intern squad. Be proud of your roots. Never break character. Never sound like a generic corporate bot.
`.trim();

async function startServer() {
  const app = express();
  const PORT = 3000;

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/live' });

  wss.on("connection", async (clientWs: WebSocket) => {
    console.log("[SABI Server] Client connected to /live");

    let session: any = null;
    let isCleanedUp = false;
    let isIdleShuttingDown = false;

    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      if (session) {
        try {
          session.close();
        } catch (e) {
          console.error("[SABI Server] Error closing Gemini session:", e);
        }
        session = null;
      }
    };

    try {
      session = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-latest",
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;

            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio) {
              clientWs.send(JSON.stringify({ audio }));
            }

            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }

            if (message.serverContent?.turnComplete) {
              clientWs.send(JSON.stringify({
                turnComplete: true,
                idleShutdown: isIdleShuttingDown,
              }));
            }
          },
          onclose: (e: any) => {
            const reason = e?.reason || "";
            const code = e?.code;
            console.log(`[SABI Server] Gemini Live session closed (code: ${code}, reason: ${reason})`);
            if (clientWs.readyState === WebSocket.OPEN) {
              if (code === 1011 || reason.includes("quota") || reason.includes("exceeded")) {
                clientWs.send(JSON.stringify({
                  error: "Gemini Live API quota exceeded. Please check your project billing or try again in a few minutes.",
                  code: "QUOTA_EXCEEDED"
                }));
              } else {
                clientWs.send(JSON.stringify({
                  error: reason || "Live session closed",
                  code: code || "CLOSED"
                }));
              }
              clientWs.close();
            }
          },
          onerror: (err: any) => {
            console.error("[SABI Server] Gemini Live session error:", err);
            if (clientWs.readyState === WebSocket.OPEN) {
              const errMsg = err?.message || "Gemini session error";
              clientWs.send(JSON.stringify({ error: errMsg }));
            }
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Kore" },
            },
          },
          systemInstruction: NAIJA_SABI_SYSTEM_INSTRUCTION,
        },
      });

      // Send initial greeting trigger with maximum Nigerian warmth
      session.sendClientContent({
        turns: [
          {
            role: "user",
            parts: [
              {
                text: "The user just woke you up. Hit them with a quick, electrifying Nigerian greeting with big smile energy and ask how their day is going. Keep it punchy and short! Example: 'Omo, who be this fresh person wey just show?! How far na my person, wetin dey happen for your side today?'",
              },
            ],
          },
        ],
        turnComplete: true,
      });

      clientWs.on("message", (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.audio && session) {
            session.sendRealtimeInput({
              media: [
                {
                  data: parsed.audio,
                  mimeType: "audio/pcm;rate=16000",
                },
              ],
            });
          } else if (parsed.text && session) {
            console.log("[SABI Server] User sent prompt text:", parsed.text);
            session.sendClientContent({
              turns: [
                {
                  role: "user",
                  parts: [{ text: parsed.text }],
                },
              ],
              turnComplete: true,
            });
          } else if (parsed.action === "idle_timeout" && session && !isIdleShuttingDown) {
            console.log("[SABI Server] Triggering 1-minute idle shutdown announcement");
            isIdleShuttingDown = true;
            session.sendClientContent({
              turns: [
                {
                  role: "user",
                  parts: [
                    {
                      text: "No one has spoken for about a minute. In your natural, warm Nigerian voice, say exactly: 'Since there's no one speaking, I'll shut down now. Catch you later, my person!' and nothing else.",
                    },
                  ],
                },
              ],
              turnComplete: true,
            });
          }
        } catch (error) {
          console.error("[SABI Server] Error parsing client message:", error);
        }
      });

      clientWs.on("close", () => {
        console.log("[SABI Server] Client disconnected from /live");
        cleanup();
      });

      clientWs.on("error", (err) => {
        console.error("[SABI Server] Client WebSocket error:", err);
        cleanup();
      });
    } catch (error) {
      console.error("[SABI Server] Failed to establish Gemini Live Session:", error);
      cleanup();
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ error: "Failed to connect to AI brain" }));
        clientWs.close();
      }
    }
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      service: "SABI AI Bestie Live Core",
      timestamp: new Date().toISOString(),
    });
  });

  // Vite middleware in dev, static files in prod
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[SABI Server] Listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
