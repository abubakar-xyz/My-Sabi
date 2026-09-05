import { useState, useRef, useEffect, useCallback } from 'react';
import { pcmToBase64, base64ToPcm, resampleAudio, calculateRMS } from '../utils/audio';
import { uiSounds } from '../utils/sounds';

export type SabiState = 'SLEEP' | 'WAKE' | 'LISTEN' | 'THINK' | 'SPEAK' | 'ERROR';

export function useLiveAudio() {
  const [sabiState, setSabiState] = useState<SabiState>('SLEEP');
  const [isConnected, setIsConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const prevStateRef = useRef<SabiState>('SLEEP');
  
  // Audio analysis states (0.0 to 1.0)
  const [micLevel, setMicLevel] = useState(0);
  const [speakerLevel, setSpeakerLevel] = useState(0);

  // Play transition sounds when state changes
  useEffect(() => {
    if (sabiState !== prevStateRef.current) {
      if (sabiState === 'WAKE') uiSounds.playWake();
      else if (sabiState === 'SLEEP' && prevStateRef.current !== 'SLEEP') uiSounds.playSleep();
      else if (sabiState === 'LISTEN' && prevStateRef.current !== 'WAKE') uiSounds.playTransition();
      else if (sabiState === 'THINK' || sabiState === 'SPEAK') uiSounds.playTransition();
      
      prevStateRef.current = sabiState;
    }
  }, [sabiState]);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  
  const nextStartTimeRef = useRef<number>(0);
  const speakingTimeoutRef = useRef<number | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // Smooth decay timer for speaker & mic levels
  const micDecayRef = useRef<number>(0);
  const speakerDecayRef = useRef<number>(0);

  // Inactivity / idle timeout tracking (1 minute = 60,000 ms)
  const lastActivityTimeRef = useRef<number>(Date.now());
  const isIdleShuttingDownRef = useRef<boolean>(false);
  const idleFailsafeTimeoutRef = useRef<number | null>(null);

  const stopAllAudioSources = useCallback(() => {
    activeSourcesRef.current.forEach((source) => {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Source might have already stopped
      }
    });
    activeSourcesRef.current = [];
    if (speakingTimeoutRef.current) {
      window.clearTimeout(speakingTimeoutRef.current);
      speakingTimeoutRef.current = null;
    }
    setSpeakerLevel(0);
    speakerDecayRef.current = 0;
  }, []);

  const playAudioChunk = useCallback((base64Audio: string) => {
    if (!outputCtxRef.current) return;
    const ctx = outputCtxRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    
    // Decode 24kHz PCM from Gemini
    const pcmData = base64ToPcm(base64Audio);
    
    // Explicit 24,000 Hz buffer for Gemini output
    const buffer = ctx.createBuffer(1, pcmData.length, 24000);
    buffer.copyToChannel(pcmData, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    
    activeSourcesRef.current.push(source);
    
    // Seamless jitter-buffered scheduling
    const now = ctx.currentTime;
    if (nextStartTimeRef.current < now) {
      nextStartTimeRef.current = now + 0.025; // 25ms jitter buffer
    }
    
    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += buffer.duration;
    
    setSabiState('SPEAK');
    lastActivityTimeRef.current = Date.now();
    
    // Dynamic RMS calculation for lifelike mouth and head expression
    const chunkRms = calculateRMS(pcmData);
    speakerDecayRef.current = Math.max(chunkRms, speakerDecayRef.current * 0.7);
    setSpeakerLevel(speakerDecayRef.current);

    if (speakingTimeoutRef.current) {
      window.clearTimeout(speakingTimeoutRef.current);
    }
    
    // Schedule return to LISTEN after speech completes
    const remainingTimeMs = Math.max(0, (nextStartTimeRef.current - now) * 1000);
    speakingTimeoutRef.current = window.setTimeout(() => {
      setSabiState('LISTEN');
      setSpeakerLevel(0);
      speakerDecayRef.current = 0;
      lastActivityTimeRef.current = Date.now(); // Start 1-minute countdown after speaking finishes
    }, remainingTimeMs + 80);

    source.onended = () => {
      try {
        source.disconnect();
      } catch {}
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
    };
  }, []);

  const disconnect = useCallback(() => {
    stopAllAudioSources();

    if (idleFailsafeTimeoutRef.current) {
      window.clearTimeout(idleFailsafeTimeoutRef.current);
      idleFailsafeTimeoutRef.current = null;
    }
    isIdleShuttingDownRef.current = false;

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {}
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (inputCtxRef.current) {
      try {
        inputCtxRef.current.close();
      } catch {}
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      try {
        outputCtxRef.current.close();
      } catch {}
      outputCtxRef.current = null;
    }

    setMicLevel(0);
    setSpeakerLevel(0);
    micDecayRef.current = 0;
    speakerDecayRef.current = 0;
    setIsConnected(false);
    setSabiState('SLEEP');
  }, [stopAllAudioSources]);

  const connect = useCallback(async () => {
    try {
      setErrorMessage(null);
      setSabiState('WAKE');
      
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      
      // Output audio context: initialize & resume synchronously inside user click event
      let outputCtx = outputCtxRef.current;
      if (!outputCtx || outputCtx.state === 'closed') {
        outputCtx = new AudioCtxClass();
        outputCtxRef.current = outputCtx;
      }
      if (outputCtx.state === 'suspended') {
        await outputCtx.resume();
      }
      uiSounds.setContext(outputCtx);
      nextStartTimeRef.current = outputCtx.currentTime;
      lastActivityTimeRef.current = Date.now();

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/live`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        setIsConnected(true);
        setSabiState('LISTEN');
        lastActivityTimeRef.current = Date.now();

        // Gracefully attempt microphone capture without aborting connection if mic is unavailable
        try {
          if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
            const inputCtx = new AudioCtxClass();
            if (inputCtx.state === 'suspended') {
              await inputCtx.resume();
            }
            inputCtxRef.current = inputCtx;
            const hardwareSampleRate = inputCtx.sampleRate;

            const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            });
            streamRef.current = stream;

            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(2048, 1, 1);
            processorRef.current = processor;

            source.connect(processor);
            processor.connect(inputCtx.destination);

            processor.onaudioprocess = (e) => {
              if (ws.readyState === WebSocket.OPEN) {
                const rawChannelData = e.inputBuffer.getChannelData(0);
                
                const currentRms = calculateRMS(rawChannelData);
                if (currentRms > 0.035) {
                  lastActivityTimeRef.current = Date.now();
                }
                micDecayRef.current = Math.max(currentRms, micDecayRef.current * 0.82);
                setMicLevel(micDecayRef.current);

                const pcm16kData = resampleAudio(rawChannelData, hardwareSampleRate, 16000);
                const base64 = pcmToBase64(pcm16kData);
                ws.send(JSON.stringify({ audio: base64 }));
              } else {
                setMicLevel(0);
              }
            };
          }
        } catch (micErr) {
          console.warn("[SABI] Microphone capture unavailable or permission pending:", micErr);
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.error) {
            console.warn("[SABI] Server sent error:", msg.error);
            setErrorMessage(msg.error);
            setSabiState('ERROR');
            return;
          }
          if (msg.audio) {
            playAudioChunk(msg.audio);
          }
          if (msg.interrupted) {
            // Instant barge-in: user spoke while Sabi was speaking
            stopAllAudioSources();
            nextStartTimeRef.current = outputCtxRef.current?.currentTime || 0;
            setSabiState('LISTEN');
          }
          if (msg.idleShutdown) {
            // Sabi has finished speaking the farewell statement ("Since there's no one speaking, I'll shut down now")
            const ctx = outputCtxRef.current;
            const remainingTimeMs = ctx ? Math.max(0, (nextStartTimeRef.current - ctx.currentTime) * 1000) : 0;
            window.setTimeout(() => {
              disconnect();
            }, remainingTimeMs + 400);
          }
        } catch (e) {
          console.error("Error processing WS message", e);
        }
      };

      ws.onclose = () => {
        disconnect();
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        setErrorMessage((prev) => prev || "Connection interrupted. Tap to wake again.");
        disconnect();
        setSabiState('ERROR');
      };
    } catch (err: unknown) {
      console.error("Failed to initialize SABI voice connection:", err);
      const msg = err instanceof Error ? err.message : "Microphone access or network issue";
      setErrorMessage(msg);
      disconnect();
      setSabiState('ERROR');
    }
  }, [playAudioChunk, disconnect, stopAllAudioSources]);

  const sendTextMessage = useCallback((text: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      lastActivityTimeRef.current = Date.now();
      setSabiState('THINK');
      wsRef.current.send(JSON.stringify({ text }));
    }
  }, []);

  // 1-minute idle speech inactivity watchdog timer
  useEffect(() => {
    if (!isConnected) {
      isIdleShuttingDownRef.current = false;
      return;
    }

    lastActivityTimeRef.current = Date.now();
    isIdleShuttingDownRef.current = false;

    const intervalId = window.setInterval(() => {
      // While SABI is waking, thinking, or actively speaking, do not advance idle time
      if (sabiState === 'WAKE' || sabiState === 'THINK' || sabiState === 'SPEAK') {
        lastActivityTimeRef.current = Date.now();
        return;
      }

      if (isIdleShuttingDownRef.current) return;

      const idleElapsed = Date.now() - lastActivityTimeRef.current;
      // 60,000 ms = 1 full minute of silence after speaking
      if (idleElapsed >= 60000) {
        console.log("[SABI Client] Inactivity detected for 1 minute. Initiating idle farewell...");
        isIdleShuttingDownRef.current = true;

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ action: "idle_timeout" }));
        }

        // Failsafe timeout in case network or model stalls
        idleFailsafeTimeoutRef.current = window.setTimeout(() => {
          if (isIdleShuttingDownRef.current) {
            disconnect();
          }
        }, 7500);
      }
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isConnected, sabiState, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    sendTextMessage,
    isConnected,
    sabiState,
    micLevel,
    speakerLevel,
    errorMessage,
  };
}
