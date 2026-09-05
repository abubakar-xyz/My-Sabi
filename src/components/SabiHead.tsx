import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { SabiState } from '../hooks/useLiveAudio';

interface SabiHeadProps {
  state: SabiState;
  micLevel: number;
  speakerLevel: number;
}

// Global pre-allocated colors to eliminate GC allocations during 60FPS render loop
const COLOR_SLEEP = new THREE.Color('#00261f');
const COLOR_WAKE = new THREE.Color('#00f5b8');
const COLOR_LISTEN = new THREE.Color('#80fff0');
const COLOR_THINK_A = new THREE.Color('#00d09c');
const COLOR_THINK_B = new THREE.Color('#f59e0b');
const COLOR_SPEAK = new THREE.Color('#00e6a8');
const COLOR_ERROR = new THREE.Color('#ef4444');

export function SabiHead({ state, micLevel, speakerLevel }: SabiHeadProps) {
  const headRef = useRef<THREE.Group>(null);
  const innerFaceRef = useRef<THREE.Group>(null);
  const leftEyeRef = useRef<THREE.Mesh>(null);
  const rightEyeRef = useRef<THREE.Mesh>(null);
  const leftBrowRef = useRef<THREE.Mesh>(null);
  const rightBrowRef = useRef<THREE.Mesh>(null);
  const auraInnerRef = useRef<THREE.Mesh>(null);
  const auraOuterRef = useRef<THREE.Mesh>(null);
  const mouthRefs = useRef<(THREE.Mesh | null)[]>([]);

  // 9 mouth equalizer bars for ultra-smooth acoustic curve
  const numBars = 9;
  const mouthBars = useMemo(() => Array.from({ length: numBars }), []);

  // Pre-allocated runtime color buffer
  const runtimeColor = useMemo(() => new THREE.Color(), []);

  // Natural blink state tracking
  const blinkState = useRef({
    isBlinking: false,
    nextBlinkTime: 2.0,
    blinkDuration: 0.14,
    blinkStartTime: 0,
  });

  useFrame((stateCtx) => {
    const time = stateCtx.clock.elapsedTime;
    const { pointer } = stateCtx;

    // 1. Interactive Head Rotation (Looks subtly toward user pointer/touch)
    if (headRef.current) {
      const baseScale = 0.95;
      let targetScale = baseScale;

      const visualSpeakerLvl = Math.min(speakerLevel * 18, 2.5);
      const visualMicLvl = Math.min(micLevel * 14, 2.0);

      // Smooth interactive tracking toward mouse/touch coordinates
      const targetLookX = pointer.x * 0.22;
      const targetLookY = pointer.y * 0.16;

      if (state === 'SPEAK') {
        targetScale = baseScale + visualSpeakerLvl * 0.04;
        const talkBob = Math.sin(time * 9) * (0.04 + visualSpeakerLvl * 0.04);
        const talkTilt = Math.sin(time * 4.5) * (0.02 + visualSpeakerLvl * 0.03);

        headRef.current.position.y = THREE.MathUtils.lerp(headRef.current.position.y, talkBob, 0.12);
        headRef.current.position.z = THREE.MathUtils.lerp(headRef.current.position.z, visualSpeakerLvl * 0.25, 0.12);
        headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, -targetLookY + Math.sin(time * 6) * 0.04, 0.1);
        headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, targetLookX + talkTilt, 0.1);
        headRef.current.rotation.z = THREE.MathUtils.lerp(headRef.current.rotation.z, Math.sin(time * 3) * 0.03, 0.08);
      } else if (state === 'LISTEN') {
        // Attentive tilt & lean forward when user speaks
        const leanZ = 0.45 + visualMicLvl * 0.4;
        headRef.current.position.y = THREE.MathUtils.lerp(headRef.current.position.y, Math.sin(time * 2) * 0.02, 0.08);
        headRef.current.position.z = THREE.MathUtils.lerp(headRef.current.position.z, leanZ, 0.08);
        headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, -targetLookY + 0.08, 0.08);
        headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, targetLookX, 0.08);
        headRef.current.rotation.z = THREE.MathUtils.lerp(headRef.current.rotation.z, Math.sin(time * 0.7) * 0.02, 0.05);
      } else if (state === 'THINK') {
        // Pondering gentle head tilt
        headRef.current.position.y = THREE.MathUtils.lerp(headRef.current.position.y, Math.sin(time * 3) * 0.02, 0.08);
        headRef.current.position.z = THREE.MathUtils.lerp(headRef.current.position.z, 0.1, 0.08);
        headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, -0.06, 0.08);
        headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, Math.sin(time * 1.5) * 0.12, 0.08);
        headRef.current.rotation.z = THREE.MathUtils.lerp(headRef.current.rotation.z, 0.06, 0.08);
      } else {
        // SLEEP / IDLE: Soft organic breathing
        const breathY = Math.sin(time * 1.2) * 0.025;
        headRef.current.position.y = THREE.MathUtils.lerp(headRef.current.position.y, breathY, 0.05);
        headRef.current.position.z = THREE.MathUtils.lerp(headRef.current.position.z, 0, 0.05);
        headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, -targetLookY * 0.5, 0.05);
        headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, targetLookX * 0.5, 0.05);
        headRef.current.rotation.z = THREE.MathUtils.lerp(headRef.current.rotation.z, 0, 0.05);
      }

      headRef.current.scale.setScalar(THREE.MathUtils.lerp(headRef.current.scale.x, targetScale, 0.15));
    }

    // 2. State-Driven Color & Illumination Intensity
    let targetIntensity = 1.0;
    switch (state) {
      case 'SLEEP':
        runtimeColor.copy(COLOR_SLEEP);
        targetIntensity = 0.15;
        break;
      case 'WAKE':
        runtimeColor.copy(COLOR_WAKE);
        targetIntensity = 2.0;
        break;
      case 'LISTEN':
        runtimeColor.copy(COLOR_LISTEN);
        targetIntensity = 1.1 + micLevel * 8.0;
        break;
      case 'THINK': {
        const thinkBlend = (Math.sin(time * 4) + 1) * 0.5;
        runtimeColor.lerpColors(COLOR_THINK_A, COLOR_THINK_B, thinkBlend);
        targetIntensity = 1.0 + Math.sin(time * 6) * 0.4;
        break;
      }
      case 'SPEAK':
        runtimeColor.copy(COLOR_SPEAK);
        targetIntensity = 1.3 + speakerLevel * 6.0;
        break;
      case 'ERROR':
        runtimeColor.copy(COLOR_ERROR);
        targetIntensity = Math.sin(time * 10) > 0 ? 1.5 : 0.2;
        break;
    }

    // 3. Natural Blink Lifecycle
    const b = blinkState.current;
    if (!b.isBlinking && time >= b.nextBlinkTime && state !== 'SLEEP') {
      b.isBlinking = true;
      b.blinkStartTime = time;
      b.blinkDuration = 0.12 + Math.random() * 0.05;
    }

    let eyeScaleY = 1.0;
    if (b.isBlinking) {
      const elapsed = time - b.blinkStartTime;
      if (elapsed >= b.blinkDuration) {
        b.isBlinking = false;
        b.nextBlinkTime = time + 2.5 + Math.random() * 4.0;
      } else {
        eyeScaleY = 0.08; // Closed during blink
      }
    }

    // 4. Eyes & Brows Expression Engine
    if (leftEyeRef.current && rightEyeRef.current && leftBrowRef.current && rightBrowRef.current) {
      const leftMat = leftEyeRef.current.material as THREE.MeshStandardMaterial;
      const rightMat = rightEyeRef.current.material as THREE.MeshStandardMaterial;

      leftMat.emissive.lerp(runtimeColor, 0.18);
      leftMat.emissiveIntensity = THREE.MathUtils.lerp(leftMat.emissiveIntensity, targetIntensity, 0.18);

      rightMat.emissive.lerp(runtimeColor, 0.18);
      rightMat.emissiveIntensity = THREE.MathUtils.lerp(rightMat.emissiveIntensity, targetIntensity, 0.18);

      let targetEyeScaleY = eyeScaleY;
      let targetLeftBrowRotZ = 0;
      let targetRightBrowRotZ = 0;
      let targetBrowY = 0.44;

      if (state === 'SLEEP') {
        targetEyeScaleY = 0.06;
        targetLeftBrowRotZ = -0.06;
        targetRightBrowRotZ = 0.06;
        targetBrowY = 0.38;
      } else if (state === 'THINK') {
        targetEyeScaleY = 0.75;
        targetLeftBrowRotZ = 0.25; // Inquisitive furrowed brows
        targetRightBrowRotZ = -0.25;
        targetBrowY = 0.36;
      } else if (state === 'SPEAK') {
        targetEyeScaleY = eyeScaleY * (1.0 + Math.min(speakerLevel * 2.5, 0.4));
        targetLeftBrowRotZ = Math.sin(time * 5) * 0.12;
        targetRightBrowRotZ = -Math.sin(time * 5) * 0.12;
        targetBrowY = 0.44 + Math.sin(time * 6) * 0.02;
      } else if (state === 'LISTEN') {
        targetEyeScaleY = eyeScaleY * (1.05 + Math.min(micLevel * 3, 0.35));
        targetLeftBrowRotZ = -0.12; // Raised, highly attentive
        targetRightBrowRotZ = 0.12;
        targetBrowY = 0.47 + Math.min(micLevel * 0.4, 0.06);
      }

      leftEyeRef.current.scale.y = THREE.MathUtils.lerp(leftEyeRef.current.scale.y, targetEyeScaleY, 0.3);
      rightEyeRef.current.scale.y = THREE.MathUtils.lerp(rightEyeRef.current.scale.y, targetEyeScaleY, 0.3);

      leftBrowRef.current.rotation.z = THREE.MathUtils.lerp(leftBrowRef.current.rotation.z, targetLeftBrowRotZ, 0.2);
      rightBrowRef.current.rotation.z = THREE.MathUtils.lerp(rightBrowRef.current.rotation.z, targetRightBrowRotZ, 0.2);
      leftBrowRef.current.position.y = THREE.MathUtils.lerp(leftBrowRef.current.position.y, targetBrowY, 0.2);
      rightBrowRef.current.position.y = THREE.MathUtils.lerp(rightBrowRef.current.position.y, targetBrowY, 0.2);
    }

    // 5. Mouth Acoustic Equalizer Wave
    mouthRefs.current.forEach((bar, i) => {
      if (!bar) return;
      const mat = bar.material as THREE.MeshStandardMaterial;
      const centerIndex = Math.floor(numBars / 2);
      const distFromCenter = Math.abs(i - centerIndex);
      const curveWeight = Math.cos((distFromCenter / centerIndex) * (Math.PI / 2.8));

      if (state === 'SPEAK') {
        const wave = Math.sin(time * 16 + i * 0.9) * 0.15;
        const speechAmp = Math.min(speakerLevel * 16, 2.6);
        const targetScaleY = Math.max(0.18, speechAmp * curveWeight * 2.2 + wave);

        bar.scale.y = THREE.MathUtils.lerp(bar.scale.y, Math.min(targetScaleY, 3.2), 0.35);
        mat.emissive.lerp(runtimeColor, 0.25);
        mat.emissiveIntensity = targetIntensity * 1.1;
      } else if (state === 'LISTEN') {
        const micRipples = Math.sin(time * 8 + i * 0.6) * 0.08 * (0.2 + micLevel * 4);
        bar.scale.y = THREE.MathUtils.lerp(bar.scale.y, 0.22 + micRipples, 0.25);
        mat.emissive.lerp(runtimeColor, 0.15);
        mat.emissiveIntensity = 0.4 + micLevel * 3.0;
      } else if (state === 'SLEEP') {
        bar.scale.y = THREE.MathUtils.lerp(bar.scale.y, 0.06, 0.1);
        mat.emissiveIntensity = 0;
      } else {
        bar.scale.y = THREE.MathUtils.lerp(bar.scale.y, 0.18, 0.2);
        mat.emissive.lerp(runtimeColor, 0.1);
        mat.emissiveIntensity = 0.35;
      }
    });

    // 6. Dual Luminous Halo Aura
    if (auraInnerRef.current && auraOuterRef.current) {
      const innerMat = auraInnerRef.current.material as THREE.MeshBasicMaterial;
      const outerMat = auraOuterRef.current.material as THREE.MeshBasicMaterial;

      innerMat.color.lerp(runtimeColor, 0.15);
      outerMat.color.lerp(runtimeColor, 0.15);

      if (state === 'SPEAK') {
        const speechAmp = Math.min(speakerLevel * 14, 2.0);
        innerMat.opacity = THREE.MathUtils.lerp(innerMat.opacity, 0.22 + speechAmp * 0.3, 0.2);
        outerMat.opacity = THREE.MathUtils.lerp(outerMat.opacity, 0.12 + speechAmp * 0.15, 0.2);

        const targetScale = 1.05 + speechAmp * 0.4;
        auraInnerRef.current.scale.setScalar(THREE.MathUtils.lerp(auraInnerRef.current.scale.x, targetScale, 0.2));
        auraOuterRef.current.scale.setScalar(THREE.MathUtils.lerp(auraOuterRef.current.scale.x, targetScale * 1.25, 0.15));
      } else if (state === 'LISTEN') {
        const micAmp = Math.min(micLevel * 10, 1.5);
        innerMat.opacity = THREE.MathUtils.lerp(innerMat.opacity, 0.16 + micAmp * 0.2, 0.1);
        outerMat.opacity = THREE.MathUtils.lerp(outerMat.opacity, 0.08 + micAmp * 0.1, 0.1);

        const targetScale = 1.0 + micAmp * 0.25;
        auraInnerRef.current.scale.setScalar(THREE.MathUtils.lerp(auraInnerRef.current.scale.x, targetScale, 0.1));
        auraOuterRef.current.scale.setScalar(THREE.MathUtils.lerp(auraOuterRef.current.scale.x, targetScale * 1.15, 0.1));
      } else if (state === 'SLEEP') {
        innerMat.opacity = THREE.MathUtils.lerp(innerMat.opacity, 0, 0.08);
        outerMat.opacity = THREE.MathUtils.lerp(outerMat.opacity, 0, 0.08);
        auraInnerRef.current.scale.setScalar(THREE.MathUtils.lerp(auraInnerRef.current.scale.x, 0.85, 0.08));
        auraOuterRef.current.scale.setScalar(THREE.MathUtils.lerp(auraOuterRef.current.scale.x, 0.9, 0.08));
      } else {
        innerMat.opacity = THREE.MathUtils.lerp(innerMat.opacity, 0.08, 0.1);
        outerMat.opacity = THREE.MathUtils.lerp(outerMat.opacity, 0.04, 0.1);
        auraInnerRef.current.scale.setScalar(THREE.MathUtils.lerp(auraInnerRef.current.scale.x, 1.0, 0.1));
        auraOuterRef.current.scale.setScalar(THREE.MathUtils.lerp(auraOuterRef.current.scale.x, 1.15, 0.1));
      }
    }
  });

  return (
    <group ref={headRef}>
      {/* Outer Atmospheric Aura (Soft Diffuse Backlight) */}
      <mesh ref={auraOuterRef} position={[0, 0, -0.65]}>
        <circleGeometry args={[4.2, 48]} />
        <meshBasicMaterial
          color="#00d09c"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Inner Concentrated Aura */}
      <mesh ref={auraInnerRef} position={[0, 0, -0.5]}>
        <circleGeometry args={[2.8, 48]} />
        <meshBasicMaterial
          color="#00f5b8"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Main Obsidian Chassis (Head Body) */}
      <RoundedBox args={[2.5, 3.4, 1.9]} radius={0.75} smoothness={8} position={[0, 0, 0]}>
        <meshPhysicalMaterial
          color="#070c0a"
          roughness={0.18}
          metalness={0.92}
          clearcoat={1.0}
          clearcoatRoughness={0.1}
          reflectivity={0.9}
        />
      </RoundedBox>

      {/* Futuristic Cyber Inlay Strips (Side Temples) */}
      <mesh position={[-1.27, 0.2, 0.1]}>
        <boxGeometry args={[0.04, 2.0, 0.4]} />
        <meshStandardMaterial color="#00d09c" emissive="#00d09c" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[1.27, 0.2, 0.1]}>
        <boxGeometry args={[0.04, 2.0, 0.4]} />
        <meshStandardMaterial color="#00d09c" emissive="#00d09c" emissiveIntensity={0.8} />
      </mesh>

      {/* Crown Inlay Strip (Top Apex) */}
      <mesh position={[0, 1.72, 0.1]}>
        <boxGeometry args={[1.2, 0.04, 0.6]} />
        <meshStandardMaterial color="#00d09c" emissive="#00d09c" emissiveIntensity={0.6} />
      </mesh>

      {/* Front Face Visor (Deep Smoked Glass) */}
      <RoundedBox args={[2.3, 3.2, 0.22]} radius={0.58} smoothness={8} position={[0, 0, 0.92]}>
        <meshPhysicalMaterial
          color="#000000"
          metalness={0.3}
          roughness={0.08}
          transmission={0.85}
          thickness={0.45}
          ior={1.48}
        />
      </RoundedBox>

      {/* Internal Electronics Display Matrix */}
      <group ref={innerFaceRef}>
        <RoundedBox args={[2.15, 3.05, 0.08]} radius={0.5} smoothness={4} position={[0, 0, 0.84]}>
          <meshStandardMaterial color="#0c1210" metalness={0.7} roughness={0.5} />
        </RoundedBox>

        {/* Left Eye Assembly */}
        <group position={[-0.58, 0.52, 0.98]}>
          <mesh ref={leftEyeRef}>
            <capsuleGeometry args={[0.16, 0.38, 8, 16]} />
            <meshStandardMaterial
              color="#000000"
              emissive="#00261f"
              emissiveIntensity={0.2}
              toneMapped={false}
            />
          </mesh>
          <mesh ref={leftBrowRef} position={[0, 0.42, 0.04]}>
            <boxGeometry args={[0.38, 0.07, 0.04]} />
            <meshStandardMaterial color="#1a2e26" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>

        {/* Right Eye Assembly */}
        <group position={[0.58, 0.52, 0.98]}>
          <mesh ref={rightEyeRef}>
            <capsuleGeometry args={[0.16, 0.38, 8, 16]} />
            <meshStandardMaterial
              color="#000000"
              emissive="#00261f"
              emissiveIntensity={0.2}
              toneMapped={false}
            />
          </mesh>
          <mesh ref={rightBrowRef} position={[0, 0.42, 0.04]}>
            <boxGeometry args={[0.38, 0.07, 0.04]} />
            <meshStandardMaterial color="#1a2e26" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>

        {/* Dynamic Mouth Equalizer Grille */}
        <group position={[0, -0.78, 0.98]}>
          {mouthBars.map((_, i) => {
            const centerIdx = Math.floor(numBars / 2);
            const offset = (i - centerIdx) * 0.17;
            return (
              <mesh
                key={i}
                ref={(el) => (mouthRefs.current[i] = el)}
                position={[offset, 0, 0]}
              >
                <boxGeometry args={[0.09, 0.28, 0.04]} />
                <meshStandardMaterial
                  color="#000000"
                  emissive="#000000"
                  toneMapped={false}
                />
              </mesh>
            );
          })}
        </group>
      </group>
    </group>
  );
}
