import React, { useMemo, useRef, useState, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, Environment, Lightformer, Sky, Clouds, Cloud, MeshTransmissionMaterial, Loader, PerformanceMonitor } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { MeadowScene } from './meadow/MeadowScene';
import { PoolroomScene } from './poolroom/PoolroomScene';
import { getShorelineZ, POOLROOM_BG, POOLROOM_FOG } from './poolroom/Constants';
import { gateConfig, worldRotation, toLocal, toWorld, constrainMovement } from './world';
import { WorldDoors } from './WorldDoors';
import './App.css';

function useTileMaterial(color, groutColor = '#e2eeef') {
  const tex = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = groutColor;
    ctx.fillRect(0, 0, 512, 512);
    
    const padding = 512 * 0.015;
    ctx.fillStyle = color;
    ctx.fillRect(padding, padding, 512 - padding * 2, 512 - padding * 2);
    
    const grad = ctx.createLinearGradient(padding, padding, 512, 512);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
    grad.addColorStop(0.2, 'rgba(255, 255, 255, 0.0)');
    grad.addColorStop(0.8, 'rgba(0, 0, 0, 0.0)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
    ctx.fillStyle = grad;
    ctx.fillRect(padding, padding, 512 - padding * 2, 512 - padding * 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    texture.anisotropy = 16;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [color, groutColor]);

  return { map: tex, roughness: 0.22, metalness: 0.0, clearcoat: 0.35, clearcoatRoughness: 0.02 };
}

function FPSController({ scene, setScene, open, enabled, spawn, touch }) {
  const { camera } = useThree();
  const keys = useRef(new Set());
  const velocity = useRef(new THREE.Vector3());
  useEffect(() => {
    camera.position.copy(spawn.position);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(spawn.pitch || 0, spawn.yaw, 0);
    velocity.current.set(0, 0, 0);
  }, [camera, spawn]);
  useEffect(() => {
    const down = event => keys.current.add(event.code);
    const up = event => keys.current.delete(event.code);
    const clear = () => { keys.current.clear(); velocity.current.set(0, 0, 0); };
    document.addEventListener('keydown', down); document.addEventListener('keyup', up);
    window.addEventListener('blur', clear); document.addEventListener('visibilitychange', clear); document.addEventListener('pointerlockchange', clear);
    return () => {
      document.removeEventListener('keydown', down); document.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', clear); document.removeEventListener('pointerlockchange', clear);
    };
  }, []);
  useFrame((_, delta) => {
    if (!enabled || (!touch && !document.pointerLockElement)) { velocity.current.set(0, 0, 0); return; }
    const dt = Math.min(delta, 0.04);
    const look = window.__lookDelta;
    if (look) {
      camera.rotation.y -= look.x; camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - look.y, -1.48, 1.48);
      look.x = look.y = 0;
    }
    const k = keys.current, stick = window.__joystick || { x: 0, y: 0 };
    const direction = new THREE.Vector3(Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft')) + stick.x, 0,
      Number(k.has('KeyS') || k.has('ArrowDown')) - Number(k.has('KeyW') || k.has('ArrowUp')) + stick.y);
    if (direction.lengthSq() > 1) direction.normalize();
    const local = toLocal(camera.position);
    const wading = scene === 'poolroom' && local.z + 12 < getShorelineZ(local.x + 1.2);
    const speed = wading ? 1.7 : k.has('ShiftLeft') || k.has('ShiftRight') ? 5.2 : 3.2;
    direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y).multiplyScalar(speed);
    velocity.current.lerp(direction, 1 - Math.exp(-12 * dt));
    const position = camera.position.clone().addScaledVector(velocity.current, dt);
    const nextScene = constrainMovement(position, scene, open);
    camera.position.copy(position);
    if (nextScene !== scene) setScene(nextScene);
  });
  return null;
}

function MobileControls({ enabled }) {
  const pointers = useRef(new Map());
  const [stick, setStick] = useState(null);
  useEffect(() => {
    window.__joystick = { x: 0, y: 0 }; window.__lookDelta = { x: 0, y: 0 };
    const reset = () => { pointers.current.clear(); window.__joystick = { x: 0, y: 0 }; setStick(null); };
    window.addEventListener('blur', reset);
    return () => { window.removeEventListener('blur', reset); reset(); };
  }, []);
  if (!enabled) return null;
  return <div className="mobile-controls" aria-label="Touch movement and look controls"
    onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, move: e.clientX < innerWidth / 2 }); }}
    onPointerMove={e => {
      const p = pointers.current.get(e.pointerId); if (!p) return;
      if (p.move) {
        const dx = e.clientX - p.x, dy = e.clientY - p.y, length = Math.max(50, Math.hypot(dx, dy));
        window.__joystick = { x: dx / length, y: dy / length }; setStick({ x: p.x, y: p.y, dx: dx / length * 42, dy: dy / length * 42 });
      } else { window.__lookDelta.x += (e.clientX - p.lastX) * 0.004; window.__lookDelta.y += (e.clientY - p.lastY) * 0.004; p.lastX = e.clientX; p.lastY = e.clientY; }
    }}
    onPointerUp={e => { if (pointers.current.get(e.pointerId)?.move) { window.__joystick = { x: 0, y: 0 }; setStick(null); } pointers.current.delete(e.pointerId); }}
    onPointerCancel={e => { pointers.current.delete(e.pointerId); window.__joystick = { x: 0, y: 0 }; setStick(null); }}>
    {stick && <div className="joystick" style={{ left: stick.x - 50, top: stick.y - 50 }}><span style={{ transform: `translate(${stick.dx}px, ${stick.dy}px)` }} /></div>}
  </div>;
}

function applyWorldUVs(geom) {
  geom.computeVertexNormals();
  const pos = geom.attributes.position;
  const uv = geom.attributes.uv;
  const norm = geom.attributes.normal;
  for(let i = 0; i < uv.count; i++) {
     const nx = Math.abs(norm.getX(i));
     const ny = Math.abs(norm.getY(i));
     const x = pos.getX(i);
     const y = pos.getY(i);
     const z = pos.getZ(i);
     if (ny > 0.5) uv.setXY(i, x, z); 
     else if (nx > 0.5) uv.setXY(i, z, y); 
     else uv.setXY(i, x, y); 
  }
}

const WavyCorridor = () => {
  const length = 140;
  const numPortholes = 12;

  const { leftWallGeoms, trim, rightWall, floor, ceiling, water, waterBase } = useMemo(() => {
    const segmentedLeftWalls = [];
    const segLength = length / numPortholes;
    for (let i = 0; i < numPortholes; i++) {
      const startX = i * segLength; const endX = (i + 1) * segLength;
      const shape = new THREE.Shape();
      shape.moveTo(startX, 0);
      for(let x = startX + 0.5; x <= endX; x += 0.5) shape.lineTo(x, 0);
      for(let y = 1; y <= 8; y += 1) shape.lineTo(endX, y);
      for(let x = endX - 0.5; x >= startX; x -= 0.5) shape.lineTo(x, 8);
      for(let y = 7; y > 0; y -= 1) shape.lineTo(startX, y);
      const hole = new THREE.Path();
      hole.absarc(startX + segLength / 2, 4, 2.6, 0, Math.PI * 2, false);
      shape.holes.push(hole);
      const geom = new THREE.ExtrudeGeometry(shape, { depth: 1.5, bevelEnabled: false, curveSegments: 32 });
      const lPos = geom.attributes.position;
      for(let j = 0; j < lPos.count; j++) {
         const x = lPos.getX(j); const y = lPos.getY(j); const z = lPos.getZ(j); 
         const z_world = -x; const x_world = Math.sin(z_world * 0.1) * 2.0 + 2 + (z - 1.5);
         lPos.setXYZ(j, x_world, y, z_world);
      }
      applyWorldUVs(geom); segmentedLeftWalls.push(geom);
    }

    const trimGeom = new THREE.BoxGeometry(0.4, 0.5, length, 2, 1, length); trimGeom.translate(0.2, 0.25, -length / 2); applyWorldUVs(trimGeom);
    const rightGeom = new THREE.BoxGeometry(1.5, 8, length, 1, 1, length); rightGeom.translate(7.75, 4, -length / 2); applyWorldUVs(rightGeom);
    const floorGeom = new THREE.BoxGeometry(4.5, 0.2, length, 4, 1, length); floorGeom.translate(4.75, -0.1, -length / 2); applyWorldUVs(floorGeom);
    const ceilGeom = new THREE.BoxGeometry(10, 0.5, length, 10, 1, length); ceilGeom.translate(3.5, 8.25, -length / 2); applyWorldUVs(ceilGeom);
    const waterGeom = new THREE.BoxGeometry(2.5, 0.8, length, 2, 1, length); waterGeom.translate(1.25, -0.4, -length / 2); applyWorldUVs(waterGeom);
    const waterBaseGeom = new THREE.BoxGeometry(2.5, 0.2, length, 2, 1, length); waterBaseGeom.translate(1.25, -0.9, -length / 2); applyWorldUVs(waterBaseGeom);

    [trimGeom, rightGeom, floorGeom, ceilGeom, waterGeom, waterBaseGeom].forEach(geom => {
      const pos = geom.attributes.position;
      for(let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + Math.sin(pos.getZ(i) * 0.1) * 2.0);
      geom.computeVertexNormals();
    });

    return { leftWallGeoms: segmentedLeftWalls, trim: trimGeom, rightWall: rightGeom, floor: floorGeom, ceiling: ceilGeom, water: waterGeom, waterBase: waterBaseGeom };
  }, []);

  const pinkTiles = useTileMaterial('#f99cba', '#e2eeef');
  const cyanTiles = useTileMaterial('#5ab8d2', '#e2eeef');
  const ceilingMaterial = new THREE.MeshStandardMaterial({ color: '#fff9e6', roughness: 0.4 });

  return (
    <group>
      <mesh geometry={floor} receiveShadow><meshPhysicalMaterial {...pinkTiles} /></mesh>
      <mesh geometry={water}><MeshTransmissionMaterial background={new THREE.Color('#5ab8d2')} transmission={0.95} thickness={1.5} roughness={0.02} chromaticAberration={0.04} color="#90e0ef" /></mesh>
      <mesh geometry={waterBase} receiveShadow><meshPhysicalMaterial {...cyanTiles} /></mesh>
      <mesh geometry={rightWall} receiveShadow><meshPhysicalMaterial {...cyanTiles} /></mesh>
      {leftWallGeoms.map((geom, idx) => <mesh key={`wall-${idx}`} geometry={geom} castShadow receiveShadow><meshPhysicalMaterial {...cyanTiles} /></mesh>)}
      <mesh geometry={trim} receiveShadow><meshStandardMaterial color="#fff3d1" roughness={0.4} /></mesh>
      <mesh geometry={ceiling} receiveShadow><primitive object={ceilingMaterial} attach="material" /></mesh>
      {Array.from({ length: 14 }).map((_, i) => {
        const z = -2 - (i * 10);
        const x = Math.sin(z * 0.1) * 2.0 + 4.75;
        return (
          <group key={`light-${i}`} position={[x, 7.98, z]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}><circleGeometry args={[0.4, 32]} /><meshBasicMaterial color="#ffffff" /></mesh>
            <pointLight intensity={2.0} color="#ffebba" distance={15} decay={2} />
          </group>
        );
      })}
      
      <group position={[gateConfig.x, 0, gateConfig.z]} rotation={[0, worldRotation, 0]}>
        {[-1, 1].map(side => <mesh key={side} position={[side * 1.8, 4, 0]} receiveShadow><boxGeometry args={[2.5, 8, 0.12]} /><meshPhysicalMaterial {...cyanTiles} /></mesh>)}
        <mesh position={[0, 5.05, 0]} receiveShadow><boxGeometry args={[1.1, 5.9, 0.12]} /><meshPhysicalMaterial {...cyanTiles} /></mesh>
      </group>
    </group>
  );
};

const OutsideScenery = () => {
  return (
    <group position={[-60, -15, -40]}>
      <Sky sunPosition={[-100, 2, 20]} turbidity={0.1} rayleigh={0.1} mieCoefficient={0.001} mieDirectionalG={0.9} />
      <directionalLight position={[-80, 20, 10]} intensity={5.0} color="#ffdd99" castShadow />
      <Clouds material={THREE.MeshLambertMaterial} limit={400}>
        <Cloud seed={1} segments={100} bounds={[80, 15, 160]} volume={80} color="#4a88b5" position={[0, -5, 0]} opacity={0.9} />
        <Cloud seed={2} segments={80} bounds={[70, 10, 150]} volume={60} color="#8bb8d6" position={[-10, 2, 10]} opacity={0.8} />
        <Cloud seed={3} segments={80} bounds={[60, 8, 140]} volume={50} color="#ffffff" position={[-5, 8, -10]} opacity={0.9} />
      </Clouds>
    </group>
  );
};

const sceneNames = { corridor: 'The Tidal Passage', meadow: 'The Sky Garden', poolroom: 'The Stillwater Hall' };
const initialScene = import.meta.env.DEV ? new URLSearchParams(location.search).get('scene') : null;
const startScene = sceneNames[initialScene] ? initialScene : 'corridor';

export default function App() {
  const [entered, setEntered] = useState(false);
  const [scene, setScene] = useState(startScene);
  const [open, setOpen] = useState({ meadow: false, poolroom: false });
  const [prompt, setPrompt] = useState('');
  const [touch] = useState(() => matchMedia('(pointer: coarse)').matches);
  const [locked, setLocked] = useState(false);
  const [visible, setVisible] = useState(true);
  const [quality, setQuality] = useState(touch ? 'balanced' : 'ultra');
  const [autoDpr, setAutoDpr] = useState(touch ? 1.25 : 1.75);
  const [muted, setMuted] = useState(false);
  const spawn = useMemo(() => ({
    position: startScene === 'meadow' ? toWorld(0, -1) : startScene === 'poolroom' ? toWorld(-1.2, -13) : new THREE.Vector3(4.75, 1.6, -2),
    yaw: startScene === 'corridor' ? 0 : worldRotation,
  }), []);
  const controls = useRef(), audio = useRef();
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    if (audio.current) { audio.current.muted = muted; if (entered && visible) audio.current.play().catch(() => {}); else audio.current.pause(); }
  }, [entered, visible, muted]);
  const resume = () => { setEntered(true); if (!touch) controls.current?.lock(); };
  const playing = entered && visible && (touch || locked);
  const showCorridor = scene === 'corridor' || (scene === 'meadow' && open.meadow);
  const showMeadow = scene === 'meadow' || (scene === 'corridor' && open.meadow) || (scene === 'poolroom' && open.poolroom);
  const showPoolroom = scene === 'poolroom' || (showMeadow && open.poolroom);
  const dpr = quality === 'ultra' ? Math.min(Math.max(devicePixelRatio || 1, 1.5), 2) : Math.min(autoDpr, 1.5);
  return <main className="dream-world">
    <Canvas shadows dpr={dpr} camera={{ fov: 68, near: 0.05, far: 450, position: spawn.position.toArray() }}
      gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}>
      <PerformanceMonitor onIncline={() => setAutoDpr(touch ? 1.25 : 1.5)} onDecline={() => setAutoDpr(1)} flipflops={3} onFallback={() => setAutoDpr(1)} />
      <color attach="background" args={[scene === 'poolroom' ? POOLROOM_BG : '#7bb8d4']} />
      <fog attach="fog" args={[scene === 'poolroom' ? POOLROOM_FOG.color : '#9dcbd9', scene === 'poolroom' ? 15 : 45, scene === 'poolroom' ? 65 : 240]} />
      <Suspense fallback={null}>
        <Environment resolution={256}>
          <Lightformer position={[0, 10, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[20, 20, 1]} intensity={2} color="#fff1d8" />
          <Lightformer position={[-10, 3, 0]} rotation={[0, Math.PI / 2, 0]} scale={[15, 8, 1]} intensity={1.5} color="#b5e4ed" />
          <Lightformer position={[10, 2, 0]} rotation={[0, -Math.PI / 2, 0]} scale={[10, 5, 1]} intensity={0.7} color="#ffd6df" />
        </Environment>
        {showCorridor && <><WavyCorridor /><OutsideScenery /></>}
        <group position={[gateConfig.x, 0, gateConfig.z]} rotation={[0, worldRotation, 0]}>
          {showMeadow && <MeadowScene />}
          {showPoolroom && <group position={[-1.2, 0, -12]}><PoolroomScene /></group>}
          <WorldDoors scene={scene} open={open} setOpen={setOpen} setPrompt={setPrompt} enabled={playing} />
        </group>
        <EffectComposer multisampling={quality === 'ultra' ? 4 : 0}>
          <Bloom luminanceThreshold={1.1} mipmapBlur intensity={0.24} />
          <Vignette eskil={false} offset={0.25} darkness={0.22} />
        </EffectComposer>
        {!touch && <PointerLockControls ref={controls} selector="#resume-dream" onLock={() => setLocked(true)} onUnlock={() => setLocked(false)} />}
        <FPSController scene={scene} setScene={setScene} open={open} enabled={playing} spawn={spawn} touch={touch} />
      </Suspense>
    </Canvas>
    <audio ref={audio} src="/bg-loop.mp3" loop preload="none" />
    <MobileControls enabled={touch && playing} />
    <div className="world-hud"><span className="wordmark">DREAMCORE<span> / </span>WANDER FREELY</span><span className="location">{sceneNames[scene]}</span></div>
    {playing && <><div className="crosshair" /><div className="travel-note">Every doorway leads both ways</div></>}
    {playing && prompt && <button className="door-prompt" onClick={() => document.dispatchEvent(new Event('dream-interact'))}><kbd>{touch ? 'TAP' : 'E'}</kbd>{prompt}</button>}
    {(!entered || (!touch && !locked)) && <div className="welcome">
      <div className="welcome-content"><p className="eyebrow">A PLACE BETWEEN PLACES</p><h1>Stay a little<br /><em>longer.</em></h1>
        <p className="intro">Follow the light. Find a doorway.<br />You can always find your way back.</p>
        <button id="resume-dream" className="enter-button" onClick={resume}>{entered ? 'Return to the dream' : 'Enter the dream'} <span>&#8599;</span></button>
        <div className="settings"><label>Graphics <select value={quality} onChange={e => setQuality(e.target.value)}><option value="ultra">Ultra HD</option><option value="balanced">Balanced</option></select></label><button onClick={() => setMuted(value => !value)}>Sound {muted ? 'off' : 'on'}</button></div>
        <p className="controls-hint">{touch ? 'Left thumb to move / Right thumb to look / Tap to open doors' : 'WASD / Arrows to move / Mouse to look / E for doors / Shift to run / Esc to pause'}</p>
      </div><span className="welcome-index">01 — ∞<br />NO WRONG TURNS</span>
    </div>}
    <Loader />
  </main>;
}
