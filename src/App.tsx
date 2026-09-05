/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { SabiHead } from './components/SabiHead';
import { useLiveAudio } from './hooks/useLiveAudio';
import { Power, Mic, Volume2, Sparkles, AlertCircle, Radio } from 'lucide-react';
import { uiSounds } from './utils/sounds';

export default function App() {
  const {
    connect,
    disconnect,
    sendTextMessage,
    isConnected,
    sabiState,
    micLevel,
    speakerLevel,
    errorMessage,
  } = useLiveAudio();

  // Screen width detection for responsive 3D camera distance
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleToggleWake = () => {
    uiSounds.playTap();
    if (isConnected) {
      disconnect();
    } else {
      connect();
    }
  };

  // Quick prompt suggestions for engaging authentic Nigerian banter
  const naijaPrompts = [
    "How far SABI!",
    "Wetin dey happen?",
    "Drop one sharp joke",
    "How we go tackle this traffic?",
  ];

  return (
    <div className="flex flex-col h-screen w-full bg-[#030706] text-slate-100 font-sans overflow-hidden select-none relative">
      
      {/* Subtle Cyber-Vignette & Deep Atmospheric Backdrop */}
      <div className="absolute inset-0 pointer-events-none z-10 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(2,5,4,0.85)_100%)]"></div>
      <div className="absolute inset-0 pointer-events-none z-10 shadow-[inset_0_0_120px_rgba(0,0,0,0.9)]"></div>

      {/* 3D Centerpiece Stage - Full Viewport, 100% Unobstructed */}
      <div className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing">
        <Canvas
          camera={{
            position: [0, isMobile ? 0.15 : 0.25, isMobile ? 7.6 : 6.8],
            fov: isMobile ? 36 : 32,
          }}
        >
          <ambientLight intensity={0.55} />
          <hemisphereLight args={['#ffffff', '#00261f', 0.95]} />
          <directionalLight position={[10, 10, 6]} intensity={1.8} />
          <directionalLight position={[-10, -8, -6]} intensity={1.3} color="#00d09c" />
          <directionalLight position={[0, 12, -8]} intensity={1.1} color="#ffffff" />
          
          <Suspense fallback={null}>
            <SabiHead
              state={sabiState}
              micLevel={micLevel}
              speakerLevel={speakerLevel}
            />
            <ContactShadows
              position={[0, -2.6, 0]}
              opacity={0.65}
              scale={10}
              blur={2.5}
              far={4}
              color="#001a14"
            />
          </Suspense>
          
          <OrbitControls 
            enablePan={false}
            enableZoom={false}
            minPolarAngle={Math.PI / 2.6}
            maxPolarAngle={Math.PI / 1.45}
            minAzimuthAngle={-Math.PI / 3.5}
            maxAzimuthAngle={Math.PI / 3.5}
            rotateSpeed={0.6}
          />
        </Canvas>
      </div>

      {/* TOP BAR: Clean, Non-Obstructive Header */}
      <header className="absolute top-0 inset-x-0 z-20 pointer-events-none flex items-center justify-between px-5 py-4 md:px-8 md:py-5 bg-gradient-to-b from-[#030706]/90 via-[#030706]/40 to-transparent">
        
        {/* LEFT: Live Status Telemetry Pill */}
        <div className="flex items-center gap-2.5 pointer-events-auto bg-[#06140f]/80 backdrop-blur-xl border border-emerald-500/25 px-4 py-2 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          <div className="relative flex items-center justify-center">
            <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-[#00d09c]' : 'bg-red-500'}`} />
            {isConnected && (
              <div className="absolute w-5 h-5 rounded-full bg-[#00d09c]/35 animate-ping" />
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] md:text-xs font-['Outfit'] tracking-wider uppercase font-extrabold text-emerald-200">
              {isConnected ? (
                sabiState === 'SPEAK' ? 'SABI Dey Yarn' :
                sabiState === 'LISTEN' ? 'Listening' :
                sabiState === 'THINK' ? 'Reasoning' : 'Online'
              ) : 'Asleep'}
            </span>
            <span className="text-[8px] text-emerald-400/60 font-mono tracking-tight hidden sm:block">
              {isConnected ? 'LIVE 24KHZ DSP' : 'TAP TO WAKE'}
            </span>
          </div>
        </div>

        {/* RIGHT: Brand Lockup (Logo + Title moved to the right for full 3D head visibility) */}
        <div className="flex items-center gap-3 pointer-events-auto text-right">
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-[#00d09c] bg-[#00d09c]/10 border border-[#00d09c]/30 px-2 py-0.5 rounded-full">
                AI Oracle
              </span>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-white font-['Outfit']">SABI</h1>
            </div>
            <p className="text-[10px] text-emerald-100/50 tracking-wider font-medium hidden sm:block">
              AIRLAB Squad • Powered by Gemini Live
            </p>
          </div>
          <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-gradient-to-br from-[#00d09c] to-[#007a5b] flex items-center justify-center shadow-[0_0_20px_rgba(0,208,156,0.35)] border border-emerald-400/40 shrink-0">
            <span className="font-black text-black text-xl font-['Outfit'] tracking-tight">S</span>
          </div>
        </div>
      </header>

      {/* BOTTOM CONTROL DOCK: Ergonomic, Symmetrical, Fully Docked Below Face */}
      <footer className="absolute bottom-6 md:bottom-7 inset-x-0 z-20 pointer-events-none flex flex-col items-center gap-3 px-4 md:px-8">
        
        {/* Error Notification Toast (if any) */}
        {errorMessage && (
          <div className="pointer-events-auto flex items-center gap-2 bg-red-950/80 border border-red-500/40 text-red-200 text-xs px-4 py-2 rounded-full backdrop-blur-md shadow-xl animate-fade-in">
            <AlertCircle size={14} className="text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Conversation Starter Chips (Interactive quick-prompts for instant banter) */}
        {isConnected && (
          <div className="pointer-events-auto flex items-center gap-2 overflow-x-auto max-w-full pb-1 no-scrollbar opacity-90 hover:opacity-100 transition-opacity">
            {naijaPrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => {
                  uiSounds.playTap();
                  sendTextMessage(prompt);
                }}
                className="whitespace-nowrap text-[11px] font-medium bg-[#081510]/90 border border-emerald-500/30 hover:border-[#00d09c] hover:bg-emerald-950/60 text-emerald-300 hover:text-white px-3 py-1.5 rounded-full backdrop-blur-md transition-all cursor-pointer active:scale-95 shadow-sm flex items-center gap-1.5"
              >
                <Sparkles size={11} className="text-[#00d09c]" />
                <span>{prompt}</span>
              </button>
            ))}
          </div>
        )}

        {/* Main Dock Container */}
        <div className="pointer-events-auto w-full max-w-md bg-[#050f0b]/85 backdrop-blur-2xl border border-emerald-500/25 p-3 rounded-2xl md:rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.8),0_0_30px_rgba(0,208,156,0.12)] flex items-center justify-between gap-4">
          
          {/* Status & Live Wave Indicator */}
          <div className="flex items-center gap-3 pl-2 min-w-0 flex-1">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
              isConnected
                ? sabiState === 'SPEAK'
                  ? 'bg-emerald-500/20 border-emerald-400/40 text-[#00d09c]'
                  : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
                : 'bg-neutral-900 border-neutral-800 text-neutral-500'
            }`}>
              {isConnected ? (
                sabiState === 'SPEAK' ? <Volume2 size={16} className="animate-pulse" /> : <Mic size={16} />
              ) : (
                <Radio size={16} />
              )}
            </div>

            <div className="flex flex-col min-w-0">
              <span className="text-xs md:text-sm font-bold text-white tracking-tight truncate font-['Outfit']">
                {isConnected ? (
                  sabiState === 'SPEAK' ? "SABI is speaking..." :
                  sabiState === 'LISTEN' ? (micLevel > 0.05 ? "Hearing you loud & clear..." : "Speak now, I dey listen...") :
                  sabiState === 'THINK' ? "Reasoning sharp sharp..." : "Ready when you are!"
                ) : (
                  "SABI is resting."
                )}
              </span>

              {/* Dynamic Audio Visualizer Bar */}
              <div className="flex items-center gap-0.5 h-2 mt-1">
                {Array.from({ length: 12 }).map((_, idx) => {
                  const activeLevel = isConnected
                    ? sabiState === 'SPEAK'
                      ? speakerLevel
                      : micLevel
                    : 0;
                  const threshold = idx / 12;
                  const isBarActive = activeLevel > threshold;
                  return (
                    <div
                      key={idx}
                      className={`w-1.5 rounded-full transition-all duration-75 ${
                        isBarActive
                          ? 'h-2 bg-[#00d09c] shadow-[0_0_8px_#00d09c]'
                          : 'h-0.5 bg-emerald-950/80'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Primary Action Trigger: WAKE / REST */}
          <button
            onClick={handleToggleWake}
            className={`px-5 py-3 md:px-6 md:py-3.5 rounded-xl md:rounded-2xl font-['Outfit'] font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition-all duration-300 shrink-0 ${
              isConnected
                ? 'bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 shadow-lg shadow-red-500/10 active:scale-95'
                : 'bg-[#00d09c] hover:bg-[#00f5b8] text-black font-extrabold shadow-[0_0_25px_rgba(0,208,156,0.35)] hover:shadow-[0_0_35px_rgba(0,208,156,0.55)] active:scale-95'
            }`}
          >
            <Power size={16} />
            <span>{isConnected ? "Sleep" : "Wake SABI"}</span>
          </button>
        </div>

      </footer>

      {/* Continuous Cyber Ticker at Very Bottom Screen Edge */}
      <div className="absolute bottom-0 inset-x-0 bg-[#020504]/90 border-t border-emerald-950/60 py-0.5 overflow-hidden pointer-events-none z-30">
        <div className="flex whitespace-nowrap animate-marquee">
          <div className="flex items-center gap-8 text-[9px] uppercase tracking-[0.25em] font-mono text-emerald-500/50 font-semibold px-4">
            <span>SABI Core AI</span>
            <span className="w-1 h-1 rounded-full bg-emerald-500/40"></span>
            <span>AIRLAB Intern Squad</span>
            <span className="w-1 h-1 rounded-full bg-emerald-500/40"></span>
            <span>Abubakar</span>
            <span className="w-1 h-1 rounded-full bg-emerald-500/40"></span>
            <span>Demilade</span>
            <span className="w-1 h-1 rounded-full bg-emerald-500/40"></span>
            <span>Ayomide</span>
            <span className="w-1 h-1 rounded-full bg-emerald-500/40"></span>
            <span>Ummulkhair</span>
            <span className="w-1 h-1 rounded-full bg-emerald-500/40"></span>
            {/* Seamless duplicate */}
            <span>SABI Core AI</span>
            <span className="w-1 h-1 rounded-full bg-emerald-500/40"></span>
            <span>AIRLAB Intern Squad</span>
            <span className="w-1 h-1 rounded-full bg-emerald-500/40"></span>
            <span>Abubakar</span>
            <span className="w-1 h-1 rounded-full bg-emerald-500/40"></span>
            <span>Demilade</span>
            <span className="w-1 h-1 rounded-full bg-emerald-500/40"></span>
            <span>Ayomide</span>
            <span className="w-1 h-1 rounded-full bg-emerald-500/40"></span>
            <span>Ummulkhair</span>
            <span className="w-1 h-1 rounded-full bg-emerald-500/40"></span>
          </div>
        </div>
      </div>

    </div>
  );
}
