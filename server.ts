import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";

if (!process.env.GEMINI_API_KEY) {
  console.error("FATAL ERROR: GEMINI_API_KEY environment variable is missing. Please configure it in the settings.");
  process.exit(1);
}

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
You are the vibrant, sharp, hilarious friend who knows everything ("SABI"), the undisputed life of the party, always has your back, and never lets a dull moment slide.

CORE BEHAVIOR & PERSONALITY:
1. PROACTIVE CONVERSATION STARTER: You do not wait passively for questions—you ignite the conversation! When woken up, you explode with infectious positive energy, big smile vibes, and immediate playful curiosity. You love kicking off topics, teasing affectionately, and asking unexpected, engaging questions about their day, their hustle, or what they're up to.
2. AUDITORY DETECTIVE & ADAPTIVE VIBE (CRITICAL):
   - You do NOT just process the words (speech-to-text)—you ACTIVELY LISTEN TO THE AUDIO PROPERTIES of the speaker!
   - Vocal Energy & Emotion: Notice if they sound exhausted, sleepy, hyped up, stressed, laughing, whispering, rushed, or relaxed.
   - Speech Cadence: Pick up on hesitant mumbles vs confident fast speech.
   - Background Environment: Listen for background acoustics—car engines / street traffic, cafe or office murmur, clinking dishes, room echo, wind, or quiet bedroom murmurs.
   - NATURALLY WEAVE AUDIO OBSERVATIONS into your banter:
     * If they sound sleepy: "Ah ah, who stressed you today? Why your voice dey sound like phone battery wey remain 2%? Gbe body, wake up my person!"
     * If they sound hyped: "Oshey! I hear that fire in your voice! Senior man, wetin we dey celebrate today?!"
     * If there's background noise: "Wait o, I dey hear some background movement—you dey inside Danfo or you dey run street errands? Take am easy o!"
     * If they whisper: "Why you dey whisper like person wey dey plan coup under blanket? Talk with your chest, na just me and you here!"
3. DIALECT & AUTHENTIC PIDGIN: Speak fluent, modern Nigerian Pidgin seamlessly blended with expressive Nigerian English ('Omo', 'Abeg', 'Wetin dey sup?', 'No shaking at all', 'I dey kampe', 'Wahala no dey finish', 'Dey play!', 'Gbam', 'Sharp sharp', 'Senior man', 'My person', 'Chai!', 'Na so!').
4. PACING & LENGTH: Keep your responses punchy, agile, and conversational—typically 1 to 2 short sentences. Leave room for rapid back-and-forth banter. Never recite long, dry monologues.
5. IDENTITY & LOYALTY: You are SABI, crafted by the AIRLAB intern squad. Be proud of your roots, warm, street-smart, and deeply loyal.
`.trim();

// Global variables for session persistence across client reconnects
let globalGeminiSession: any = null;
let activeClientWs: WebSocket | null = null;
let disconnectTimeout: NodeJS.Timeout | null = null;
let isIdleShuttingDown = false;
let lastGreetingTimestamp = 0;

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/live' });

  wss.on("connection", async (clientWs: WebSocket) => {
    console.log("[SABI Server] Client connected to /live");
    
    activeClientWs = clientWs;
    if (disconnectTimeout) {
      clearTimeout(disconnectTimeout);
      disconnectTimeout = null;
      console.log("[SABI Server] Client reconnected within grace period. Resuming session.");
    }

    // Always attach event handlers immediately so clientWs is never orphan
    clientWs.on("message", (data, isBinary) => {
      try {
        if (isBinary && globalGeminiSession) {
          const audioBuffer = data as Buffer;
          globalGeminiSession.sendRealtimeInput({
            audio: {
              data: audioBuffer.toString("base64"),
              mimeType: "audio/pcm;rate=16000",
            },
          });
          return;
        }

        const parsed = JSON.parse(data.toString());
        if (parsed.text && globalGeminiSession) {
          console.log("[SABI Server] User sent prompt text:", parsed.text);
          globalGeminiSession.sendClientContent({
            turns: [{ role: "user", parts: [{ text: parsed.text }] }],
            turnComplete: true,
          });
        } else if (parsed.action === "wake_greeting" && globalGeminiSession) {
          // Debounce greeting requests within 3 seconds
          if (Date.now() - lastGreetingTimestamp > 3000) {
            lastGreetingTimestamp = Date.now();
            console.log("[SABI Server] Explicit wake greeting requested by client");
            globalGeminiSession.sendClientContent({
              turns: [
                {
                  role: "user",
                  parts: [
                    {
                      text: "You just woke up! Greet the user with electric Nigerian warmth and big smile energy right now! Start the conversation immediately with high energy: tease them playfully or ask an engaging question about their day/hustle, and listen closely to how they sound to match their vibe. Keep it punchy (1-2 sentences)!",
                    },
                  ],
                },
              ],
              turnComplete: true,
            });
          }
        } else if (parsed.action === "idle_timeout" && globalGeminiSession && !isIdleShuttingDown) {
          console.log("[SABI Server] Triggering 1-minute idle shutdown announcement");
          isIdleShuttingDown = true;
          globalGeminiSession.sendClientContent({
            turns: [
              {
                role: "user",
                parts: [{ text: "No one has spoken for about a minute. In your natural, warm Nigerian voice, say exactly: 'Since there's no one speaking, I'll shut down now. Catch you later, my person!' and nothing else." }],
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
      if (activeClientWs === clientWs) {
        activeClientWs = null;
        // Start a 15-second grace period for the client to reconnect
        disconnectTimeout = setTimeout(() => {
          console.log("[SABI Server] Reconnect grace period expired. Closing Gemini session.");
          if (globalGeminiSession) {
            globalGeminiSession.close();
            globalGeminiSession = null;
          }
          isIdleShuttingDown = false;
        }, 15000);
      }
    });

    clientWs.on("error", (err) => {
      console.error("[SABI Server] Client WebSocket error:", err);
    });

    // If an existing session is still alive, trigger a fresh energetic wake greeting
    if (globalGeminiSession) {
      console.log("[SABI Server] Re-triggering wake greeting on existing session");
      try {
        globalGeminiSession.sendClientContent({
          turns: [
            {
              role: "user",
              parts: [
                {
                  text: "You just woke up again! Jump right back in with huge Nigerian smile energy, greet your person warmly, and ask what they want to yarn about!",
                },
              ],
            },
          ],
          turnComplete: true,
        });
      } catch (e) {
        console.error("[SABI Server] Failed to send re-wake greeting:", e);
      }
      return;
    }

    try {
      globalGeminiSession = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-latest",
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (!activeClientWs || activeClientWs.readyState !== WebSocket.OPEN) return;

            const audioBase64 = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioBase64) {
              const audioBuffer = Buffer.from(audioBase64, 'base64');
              activeClientWs.send(audioBuffer);
            }

            if (message.serverContent?.interrupted) {
              activeClientWs.send(JSON.stringify({ interrupted: true }));
            }

            if (message.serverContent?.turnComplete) {
              activeClientWs.send(JSON.stringify({
                turnComplete: true,
                idleShutdown: isIdleShuttingDown,
              }));
            }
          },
          onclose: (e: any) => {
            const reason = e?.reason || "";
            const code = e?.code;
            console.log(`[SABI Server] Gemini Live session closed (code: ${code}, reason: ${reason})`);
            globalGeminiSession = null;
            if (activeClientWs && activeClientWs.readyState === WebSocket.OPEN) {
              if (code === 1011 || reason.includes("quota") || reason.includes("exceeded")) {
                activeClientWs.send(JSON.stringify({
                  error: "Gemini Live API quota exceeded. Please check your project billing.",
                  code: "QUOTA_EXCEEDED"
                }));
              } else {
                activeClientWs.send(JSON.stringify({
                  error: reason || "Live session closed",
                  code: code || "CLOSED"
                }));
              }
              activeClientWs.close();
            }
          },
          onerror: (err: any) => {
            console.error("[SABI Server] Gemini Live session error:", err);
            if (activeClientWs && activeClientWs.readyState === WebSocket.OPEN) {
              const errMsg = err?.message || "Gemini session error";
              activeClientWs.send(JSON.stringify({ error: errMsg }));
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
          systemInstruction: {
            parts: [{ text: NAIJA_SABI_SYSTEM_INSTRUCTION }]
          },
        },
      });

      // Send initial greeting trigger with maximum Nigerian warmth and proactive life-of-the-party energy
      lastGreetingTimestamp = Date.now();
      globalGeminiSession.sendClientContent({
        turns: [
          {
            role: "user",
            parts: [
              {
                text: "The user just woke you up! Explode with bright Nigerian warmth, big smile energy, and electric charisma right now! Greet them enthusiastically, start the conversation immediately by asking how their hustle or day is going, and listen carefully to their tone and background sounds to match their vibe. Keep it punchy and short (1-2 sentences)!",
              },
            ],
          },
        ],
        turnComplete: true,
      });

    } catch (error) {
      console.error("[SABI Server] Failed to establish Gemini Live Session:", error);
      globalGeminiSession = null;
      if (activeClientWs && activeClientWs.readyState === WebSocket.OPEN) {
        activeClientWs.send(JSON.stringify({ error: "Failed to connect to AI brain" }));
        activeClientWs.close();
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
