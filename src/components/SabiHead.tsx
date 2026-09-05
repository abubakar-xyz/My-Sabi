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

  const sigilRef = useRef<THREE.Group>(null);
  const mouthTopRef = useRef<THREE.Mesh>(null);
  const mouthBottomRef = useRef<THREE.Mesh>(null);
  const irisRef = useRef<THREE.Group>(null);
  const irisBladesRef = useRef<(THREE.Mesh | null)[]>([]);

  // 9 mouth aperture blades for the radial iris (THINK only)
  const numBlades = 9;
  const blades = useMemo(() => Array.from({ length: numBlades }), []);

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
      const baseScale = 0.82;
      let targetScale = baseScale;

      const visualSpeakerLvl = Math.min(speakerLevel * 18, 2.5);
      const visualMicLvl = Math.min(micLevel * 14, 2.0);

      // Smooth interactive tracking toward mouse/touch coordinates (tuned for smaller scale)
      const targetLookX = pointer.x * 0.28;
      const targetLookY = pointer.y * 0.22;

      if (state === 'SPEAK') {
        targetScale = baseScale + visualSpeakerLvl * 0.035;
        const talkBob = Math.sin(time * 9) * (0.035 + visualSpeakerLvl * 0.035);
        const talkTilt = Math.sin(time * 4.5) * (0.015 + visualSpeakerLvl * 0.025);

        headRef.current.position.y = THREE.MathUtils.lerp(headRef.current.position.y, talkBob, 0.12);
        headRef.current.position.z = THREE.MathUtils.lerp(headRef.current.position.z, visualSpeakerLvl * 0.2, 0.12);
        headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, -targetLookY + Math.sin(time * 6) * 0.04, 0.1);
        headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, targetLookX + talkTilt, 0.1);
        headRef.current.rotation.z = THREE.MathUtils.lerp(headRef.current.rotation.z, Math.sin(time * 3) * 0.03, 0.08);
      } else if (state === 'LISTEN') {
        // Attentive tilt & lean forward when user speaks
        const leanZ = 0.35 + visualMicLvl * 0.35;
        headRef.current.position.y = THREE.MathUtils.lerp(headRef.current.position.y, Math.sin(time * 2) * 0.02, 0.08);
        headRef.current.position.z = THREE.MathUtils.lerp(headRef.current.position.z, leanZ, 0.08);
        headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, -targetLookY + 0.12, 0.08);
        headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, targetLookX, 0.08);
        headRef.current.rotation.z = THREE.MathUtils.lerp(headRef.current.rotation.z, Math.sin(time * 0.7) * 0.02, 0.05);
      } else if (state === 'THINK') {
        // Pondering gentle head tilt
        headRef.current.position.y = THREE.MathUtils.lerp(headRef.current.position.y, Math.sin(time * 3) * 0.02, 0.08);
        headRef.current.position.z = THREE.MathUtils.lerp(headRef.current.position.z, 0.08, 0.08);
        headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, -0.08, 0.08);
        headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, Math.sin(time * 1.5) * 0.15, 0.08);
        headRef.current.rotation.z = THREE.MathUtils.lerp(headRef.current.rotation.z, 0.08, 0.08);
      } else {
        // SLEEP / IDLE: Soft organic breathing
        const breathY = Math.sin(time * 1.2) * 0.025;
        headRef.current.position.y = THREE.MathUtils.lerp(headRef.current.position.y, breathY, 0.05);
        headRef.current.position.z = THREE.MathUtils.lerp(headRef.current.position.z, 0, 0.05);
        headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, -targetLookY * 0.6, 0.05);
        headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, targetLookX * 0.6, 0.05);
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
      
      // Asymmetric drift for "aliveness"
      const leftDriftX = Math.sin(time * 2.1) * 0.005;
      const rightDriftX = Math.sin(time * 1.9 + 1.5) * 0.005;
      const leftDriftY = Math.cos(time * 1.7) * 0.005;
      const rightDriftY = Math.cos(time * 2.3 + 0.8) * 0.005;
      
      let targetLeftBrowRotZ = 0;
      let targetRightBrowRotZ = 0;
      let targetLeftBrowY = 0.25;
      let targetRightBrowY = 0.25;

      if (state === 'SLEEP') {
        targetEyeScaleY = 0.06;
        targetLeftBrowRotZ = -0.06;
        targetRightBrowRotZ = 0.06;
        targetLeftBrowY = 0.23;
        targetRightBrowY = 0.23;
      } else if (state === 'THINK') {
        targetEyeScaleY = 0.75;
        targetLeftBrowRotZ = 0.15; // Inquisitive furrowed brows
        targetRightBrowRotZ = -0.15;
        targetLeftBrowY = 0.22;
        targetRightBrowY = 0.22;
      } else if (state === 'SPEAK') {
        targetEyeScaleY = eyeScaleY * (1.0 + Math.min(speakerLevel * 2.5, 0.4));
        targetLeftBrowRotZ = Math.sin(time * 5) * 0.06;
        targetRightBrowRotZ = -Math.sin(time * 5.2) * 0.06;
        targetLeftBrowY = 0.25 + Math.sin(time * 6) * 0.02;
        targetRightBrowY = 0.25 + Math.sin(time * 6.3) * 0.02;
      } else if (state === 'LISTEN') {
        targetEyeScaleY = eyeScaleY * (1.05 + Math.min(micLevel * 3, 0.35));
        targetLeftBrowRotZ = -0.08; 
        targetRightBrowRotZ = 0.08;
        // Asymmetric listening eyebrows
        targetLeftBrowY = 0.27 + Math.min(micLevel * 0.3, 0.05);
        targetRightBrowY = 0.29 + Math.min(micLevel * 0.4, 0.07);
      }

      // Base eye tracking logic from pointer
      const targetLookX = pointer.x * 0.28;
      const targetLookY = pointer.y * 0.22;

      leftEyeRef.current.position.x = THREE.MathUtils.lerp(leftEyeRef.current.position.x, targetLookX * 0.4 + leftDriftX, 0.15);
      leftEyeRef.current.position.y = THREE.MathUtils.lerp(leftEyeRef.current.position.y, -targetLookY * 0.4 + leftDriftY, 0.15);
      
      rightEyeRef.current.position.x = THREE.MathUtils.lerp(rightEyeRef.current.position.x, targetLookX * 0.4 + rightDriftX, 0.15);
      rightEyeRef.current.position.y = THREE.MathUtils.lerp(rightEyeRef.current.position.y, -targetLookY * 0.4 + rightDriftY, 0.15);

      leftEyeRef.current.scale.y = THREE.MathUtils.lerp(leftEyeRef.current.scale.y, targetEyeScaleY, 0.3);
      rightEyeRef.current.scale.y = THREE.MathUtils.lerp(rightEyeRef.current.scale.y, targetEyeScaleY, 0.3);

      leftBrowRef.current.rotation.z = THREE.MathUtils.lerp(leftBrowRef.current.rotation.z, targetLeftBrowRotZ, 0.2);
      rightBrowRef.current.rotation.z = THREE.MathUtils.lerp(rightBrowRef.current.rotation.z, targetRightBrowRotZ, 0.2);
      leftBrowRef.current.position.y = THREE.MathUtils.lerp(leftBrowRef.current.position.y, targetLeftBrowY, 0.2);
      rightBrowRef.current.position.y = THREE.MathUtils.lerp(rightBrowRef.current.position.y, targetRightBrowY, 0.2);
    }

    // 5. Mouth Arcs & Iris Engine
    if (mouthTopRef.current && mouthBottomRef.current) {
      const matTop = mouthTopRef.current.material as THREE.MeshStandardMaterial;
      const matBot = mouthBottomRef.current.material as THREE.MeshStandardMaterial;

      let targetScaleYTop = 0.01;
      let targetScaleYBot = 0.01;
      let targetMouthIntensity = 0;

      if (state === 'SPEAK') {
        const speechAmp = Math.min(speakerLevel * 16, 2.6);
        targetScaleYTop = 0.2 + speechAmp * 0.4;
        targetScaleYBot = 0.2 + speechAmp * 0.4;
        targetMouthIntensity = targetIntensity * 1.1;
        matTop.emissive.lerp(runtimeColor, 0.2);
        matBot.emissive.lerp(runtimeColor, 0.2);
      } else if (state === 'LISTEN') {
        const micRipples = Math.sin(time * 8) * 0.02 * (0.2 + micLevel * 4);
        targetScaleYTop = 0.02; // Flat top for smile
        targetScaleYBot = 0.4 + micLevel * 1.5 + micRipples; // Deep lower smile
        targetMouthIntensity = 0.4 + micLevel * 3.0;
        matTop.emissive.lerp(runtimeColor, 0.15);
        matBot.emissive.lerp(runtimeColor, 0.15);
      } else if (state === 'THINK') {
        targetScaleYTop = 0.001;
        targetScaleYBot = 0.001;
        targetMouthIntensity = 0;
      } else if (state === 'SLEEP') {
        targetScaleYTop = 0.02;
        targetScaleYBot = 0.02;
        targetMouthIntensity = 0;
      } else {
        targetScaleYTop = 0.1;
        targetScaleYBot = 0.1;
        targetMouthIntensity = 0.35;
        matTop.emissive.lerp(runtimeColor, 0.1);
        matBot.emissive.lerp(runtimeColor, 0.1);
      }

      mouthTopRef.current.scale.y = THREE.MathUtils.lerp(mouthTopRef.current.scale.y, targetScaleYTop, 0.2);
      mouthBottomRef.current.scale.y = THREE.MathUtils.lerp(mouthBottomRef.current.scale.y, targetScaleYBot, 0.2);
      
      matTop.emissiveIntensity = THREE.MathUtils.lerp(matTop.emissiveIntensity, targetMouthIntensity, 0.2);
      matBot.emissiveIntensity = THREE.MathUtils.lerp(matBot.emissiveIntensity, targetMouthIntensity, 0.2);
    }

    // Iris (Only visible during THINK)
    if (irisRef.current) {
      if (state === 'THINK') {
        irisRef.current.visible = true;
        irisRef.current.rotation.z += 0.02;
        irisRef.current.scale.setScalar(THREE.MathUtils.lerp(irisRef.current.scale.x, 1.0, 0.1));
      } else {
        irisRef.current.scale.setScalar(THREE.MathUtils.lerp(irisRef.current.scale.x, 0.001, 0.2));
        if (irisRef.current.scale.x < 0.01) irisRef.current.visible = false;
      }
      
      irisBladesRef.current.forEach((blade, i) => {
        if (!blade) return;
        const mat = blade.material as THREE.MeshStandardMaterial;
        mat.emissive.lerp(runtimeColor, 0.1);
        mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, 0.8, 0.1);
      });
    }

    // 5b. Thinking Sigil Animation
    if (sigilRef.current) {
      if (state === 'THINK') {
        sigilRef.current.scale.setScalar(THREE.MathUtils.lerp(sigilRef.current.scale.x, 1.0, 0.1));
        sigilRef.current.rotation.z += 0.02;
        sigilRef.current.visible = true;
      } else {
        sigilRef.current.scale.setScalar(THREE.MathUtils.lerp(sigilRef.current.scale.x, 0.001, 0.2));
        if (sigilRef.current.scale.x < 0.01) {
          sigilRef.current.visible = false;
        }
      }
    }

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
      {/* Primary Cranium Chassis */}
      <RoundedBox args={[2.35, 3.25, 1.85]} radius={0.75} smoothness={12} position={[0, 0, 0]}>
        <meshPhysicalMaterial
          color="#121614"
          roughness={0.12}
          metalness={0.94}
          clearcoat={1.0}
          clearcoatRoughness={0.08}
          reflectivity={0.95}
        />
      </RoundedBox>

      {/* Futuristic Cyber Inlay Strips (Side Temples) */}
      <mesh position={[-1.22, 0.2, 0.1]}>
        <boxGeometry args={[0.06, 1.9, 0.25]} />
        <meshStandardMaterial color="#00d09c" emissive="#00d09c" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[1.22, 0.2, 0.1]}>
        <boxGeometry args={[0.06, 1.9, 0.25]} />
        <meshStandardMaterial color="#00d09c" emissive="#00d09c" emissiveIntensity={0.8} />
      </mesh>

      {/* Crown Inlay Strip (Top Apex) */}
      <mesh position={[0, 1.66, 0.1]}>
        <boxGeometry args={[1.1, 0.04, 0.4]} />
        <meshStandardMaterial color="#00d09c" emissive="#00d09c" emissiveIntensity={0.6} />
      </mesh>

      {/* Front Face Visor (Deep Smoked Glass Faux-Effect) */}
      <RoundedBox args={[2.18, 3.12, 0.18]} radius={0.6} smoothness={10} position={[0, 0, 0.9]}>
        <meshStandardMaterial
          color="#040605"
          metalness={0.9}
          roughness={0.1}
          transparent={true}
          opacity={0.85}
        />
      </RoundedBox>

      {/* Internal Electronics Display Matrix */}
      <group ref={innerFaceRef}>
        <RoundedBox args={[2.08, 3.0, 0.05]} radius={0.5} smoothness={4} position={[0, 0, 0.84]}>
          <meshStandardMaterial color="#0a0f0d" metalness={0.8} roughness={0.4} />
        </RoundedBox>

        {/* Subtle Nose Bridge Landmark */}
        <mesh position={[0, 0, 0.87]}>
          <capsuleGeometry args={[0.08, 0.8, 4, 8]} />
          <meshStandardMaterial color="#111815" roughness={0.6} metalness={0.9} />
        </mesh>

        {/* Left Eye Assembly */}
        <group position={[-0.55, 0.52, 0.98]}>
          <mesh ref={leftEyeRef}>
            <capsuleGeometry args={[0.14, 0.35, 8, 16]} />
            <meshStandardMaterial
              color="#000000"
              emissive="#00261f"
              emissiveIntensity={0.2}
              toneMapped={false}
            />
            {/* Catchlight */}
            <mesh position={[-0.04, 0.12, 0.12]}>
              <sphereGeometry args={[0.03, 8, 8]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          </mesh>
          <mesh ref={leftBrowRef} position={[0, 0.25, 0.02]}>
            <torusGeometry args={[0.18, 0.04, 8, 16, Math.PI]} />
            <meshStandardMaterial color="#000000" emissive="#00d09c" emissiveIntensity={0.2} toneMapped={false} />
          </mesh>
        </group>

        {/* Right Eye Assembly */}
        <group position={[0.55, 0.52, 0.98]}>
          <mesh ref={rightEyeRef}>
            <capsuleGeometry args={[0.14, 0.35, 8, 16]} />
            <meshStandardMaterial
              color="#000000"
              emissive="#00261f"
              emissiveIntensity={0.2}
              toneMapped={false}
            />
            {/* Catchlight */}
            <mesh position={[-0.04, 0.12, 0.12]}>
              <sphereGeometry args={[0.03, 8, 8]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          </mesh>
          <mesh ref={rightBrowRef} position={[0, 0.25, 0.02]}>
            <torusGeometry args={[0.18, 0.04, 8, 16, Math.PI]} />
            <meshStandardMaterial color="#000000" emissive="#00d09c" emissiveIntensity={0.2} toneMapped={false} />
          </mesh>
        </group>

        {/* Dynamic Curved Mouth (SLEEP / LISTEN / SPEAK) */}
        <group position={[0, -0.68, 0.98]}>
          <mesh ref={mouthTopRef} rotation={[0, 0, 0]}>
            <torusGeometry args={[0.2, 0.04, 16, 32, Math.PI]} />
            <meshStandardMaterial color="#000000" emissive="#000000" toneMapped={false} />
          </mesh>
          <mesh ref={mouthBottomRef} rotation={[0, 0, Math.PI]}>
            <torusGeometry args={[0.2, 0.04, 16, 32, Math.PI]} />
            <meshStandardMaterial color="#000000" emissive="#000000" toneMapped={false} />
          </mesh>
        </group>

        {/* Oracle Thinking Radial Iris (Revealed only during THINK) */}
        <group ref={irisRef} position={[0, -0.68, 0.98]} visible={false}>
          {blades.map((_, i) => {
            const angle = (i / numBlades) * Math.PI * 2;
            const radius = 0.28;
            return (
              <mesh
                key={i}
                ref={(el) => (irisBladesRef.current[i] = el)}
                position={[Math.cos(angle) * radius, Math.sin(angle) * radius, 0]}
                rotation={[0, 0, angle + Math.PI / 2]}
              >
                <boxGeometry args={[0.05, 0.16, 0.03]} />
                <meshStandardMaterial
                  color="#000000"
                  emissive="#000000"
                  toneMapped={false}
                />
              </mesh>
            );
          })}
        </group>

        {/* Oracle Thinking Sigil (Revealed only during THINK) */}
        <group ref={sigilRef} position={[0, 1.25, 0.98]} scale={0.001} visible={false}>
          <mesh rotation={[0, 0, Math.PI / 4]}>
            <torusGeometry args={[0.2, 0.02, 16, 4]} />
            <meshStandardMaterial color="#000000" emissive="#00d09c" emissiveIntensity={1.5} toneMapped={false} />
          </mesh>
          <mesh>
            <circleGeometry args={[0.08, 3]} />
            <meshStandardMaterial color="#000000" emissive="#00f5b8" emissiveIntensity={2.0} toneMapped={false} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
