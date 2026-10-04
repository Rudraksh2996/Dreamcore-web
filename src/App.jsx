import React, { useMemo, useRef, useState, useEffect, Suspense, createContext, useContext } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, Environment, Sky, Clouds, Cloud, MeshTransmissionMaterial, Html } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { MeadowScene } from './meadow/MeadowScene';
import { PortalDoor } from './meadow/PortalDoor';
import { SixPanelDoorMesh, DoorCasing } from './meadow/SharedDoors';

const GlobalStateContext = createContext();
export const useGlobalState = () => useContext(GlobalStateContext);

import { getDoorFrame } from './meadow/DoorHelper';

const gateConfig = {
  z: -140,
  x: Math.sin(-140 * 0.1) * 2.0 + 4.75,
  rotY: Math.atan2(Math.cos(-140 * 0.1) * 0.2, -1)
};
const gateMatrix = new THREE.Matrix4().makeRotationY(gateConfig.rotY);
gateMatrix.setPosition(gateConfig.x, 0, gateConfig.z);

const { doorPos, forward, right, signedDistance, signedLateral } = getDoorFrame(gateConfig);

// Dev assertions
if (import.meta.env.DEV) {
   const spawnDist = signedDistance(new THREE.Vector3(4.75, 1.6, -2));
   if (spawnDist > -50) throw new Error("Assertion failed: Spawn is not sufficiently far on corridor side: " + spawnDist);
   
   const beforeDoor = doorPos.clone().add(forward.clone().multiplyScalar(-1.0));
   if (signedDistance(beforeDoor) > 0) throw new Error("Assertion failed: Point before door is positive");
   
   const insideDoor = doorPos.clone().add(forward.clone().multiplyScalar(1.0));
   if (signedDistance(insideDoor) < 0) throw new Error("Assertion failed: Point inside door is negative");
}

/* ============================================================
   1. PROCEDURAL TILE TEXTURE GENERATOR
   ============================================================ */
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

/* ============================================================
   2. CUSTOM FPS CONTROLLER & PHYSICS
   ============================================================ */
const FPSController = ({ teleportTarget }) => {
  const camera = useThree(state => state.camera);
  const moveState = useRef({ forward: false, backward: false, left: false, right: false });
  const velocity = useRef(new THREE.Vector3());
  const position = useRef(new THREE.Vector3(4.75, 1.6, -2)); 
  const { activeScene, setPlayerMeadowLocalZ } = useGlobalState();

  useEffect(() => {
    camera.rotation.order = 'YXZ';
    const onKeyDown = (e) => {
      switch (e.code) {
        case 'KeyW': moveState.current.forward = true; break;
        case 'KeyS': moveState.current.backward = true; break;
        case 'KeyA': moveState.current.left = true; break;
        case 'KeyD': moveState.current.right = true; break;
      }
    };
    const onKeyUp = (e) => {
      switch (e.code) {
        case 'KeyW': moveState.current.forward = false; break;
        case 'KeyS': moveState.current.backward = false; break;
        case 'KeyA': moveState.current.left = false; break;
        case 'KeyD': moveState.current.right = false; break;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [camera]);

  useEffect(() => {
    if (teleportTarget) {
      position.current.copy(teleportTarget.pos);
      camera.rotation.set(teleportTarget.pitch || 0, teleportTarget.yaw, 0);
      velocity.current.set(0, 0, 0);
    }
  }, [teleportTarget, camera]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1); 
    const speed = 6.0;
    const damping = 8.0;

    velocity.current.x -= velocity.current.x * damping * dt;
    velocity.current.z -= velocity.current.z * damping * dt;

    const direction = new THREE.Vector3();
    if (moveState.current.forward) direction.z -= 1;
    if (moveState.current.backward) direction.z += 1;
    if (moveState.current.left) direction.x -= 1;
    if (moveState.current.right) direction.x += 1;
    if (direction.lengthSq() > 0) direction.normalize();

    if (moveState.current.forward || moveState.current.backward) velocity.current.z += direction.z * speed * dt;
    if (moveState.current.left || moveState.current.right) velocity.current.x += direction.x * speed * dt;

    const camEuler = new THREE.Euler(0, camera.rotation.y, 0);
    const worldVelocity = velocity.current.clone().applyEuler(camEuler);
    const nextPos = position.current.clone().add(worldVelocity);

    const sDist = signedDistance(nextPos);
    setPlayerMeadowLocalZ(sDist);

    let boundsString = 'None';
    if (activeScene === 'corridor') {
      boundsString = 'Corridor';
      const z = nextPos.z;
      const pathCenter = Math.sin(z * 0.1) * 2.0 + 4.75;
      const minX = pathCenter - 1.8; const maxX = pathCenter + 1.8; 
      if (nextPos.x < minX) { nextPos.x = minX; velocity.current.x = 0; }
      if (nextPos.x > maxX) { nextPos.x = maxX; velocity.current.x = 0; }
      if (nextPos.z > -1) { nextPos.z = -1; velocity.current.z = 0; }
      
        // Portal Door bounds: block walking past the door plane UNLESS within the opening
        if (sDist > -0.2) {
           boundsString = 'Corridor + Door Block';
           const lat = signedLateral(nextPos);
           const radius = 0.2; // 0.4m diameter
           if (lat < -0.475 + radius || lat > 0.475 - radius) {
              boundsString = 'Doorway Side Wall';
              // Push back to corridor side
              const safeLat = THREE.MathUtils.clamp(lat, -0.475 + radius, 0.475 - radius);
              const pushLat = doorPos.clone().add(right.clone().multiplyScalar(safeLat));
              nextPos.x = pushLat.x + forward.x * -0.2;
              nextPos.z = pushLat.z + forward.z * -0.2;
              velocity.current.x = 0; velocity.current.z = 0;
           } else if (!globalState?.doorOpen && sDist > 0.0) {
              boundsString = 'Closed Door Leaf';
              const pushLat = doorPos.clone().add(right.clone().multiplyScalar(lat));
              nextPos.x = pushLat.x + forward.x * -0.05;
              nextPos.z = pushLat.z + forward.z * -0.05;
              velocity.current.x = 0; velocity.current.z = 0;
           }
        }
      } else {
      boundsString = 'Meadow';
      // MEADOW BOUNDS
      // 5m width (-2.5 to 2.5), 12m length (sDist 0 to 12)
      const lat = signedLateral(nextPos);
      const radius = 0.2;
      if (lat < -2.3) { 
         const p = doorPos.clone().add(forward.clone().multiplyScalar(sDist)).add(right.clone().multiplyScalar(-2.3));
         nextPos.x = p.x; nextPos.z = p.z; velocity.current.x = 0; velocity.current.z = 0; 
      }
      if (lat > 2.3) { 
         const p = doorPos.clone().add(forward.clone().multiplyScalar(sDist)).add(right.clone().multiplyScalar(2.3));
         nextPos.x = p.x; nextPos.z = p.z; velocity.current.x = 0; velocity.current.z = 0; 
      }
      if (sDist > 11.8) { 
         const p = doorPos.clone().add(forward.clone().multiplyScalar(11.8)).add(right.clone().multiplyScalar(lat));
         nextPos.x = p.x; nextPos.z = p.z; velocity.current.x = 0; velocity.current.z = 0; 
      }
      
      if (sDist > 2.5 && globalState?.doorOpen) {
         if (globalState?.setDoorOpen) globalState.setDoorOpen(false);
      }
      
      // Door closes behind player at sDist > 2.0. Prevent walking back into it.
      // But while crossing (door is open), allow them to stand in the doorway (down to sDist = -0.2)
      const minSDist = globalState?.doorOpen ? -0.2 : 0.05;
      if (sDist < minSDist) {
         const latClamp = globalState?.doorOpen ? THREE.MathUtils.clamp(lat, -0.475 + radius, 0.475 - radius) : lat;
         const p = doorPos.clone().add(forward.clone().multiplyScalar(minSDist)).add(right.clone().multiplyScalar(latClamp));
         nextPos.x = p.x; nextPos.z = p.z; velocity.current.x = 0; velocity.current.z = 0; 
      }
    }

    if (window.setDebugInfo) {
       window.setDebugInfo({ x: nextPos.x, z: nextPos.z, sDist, bounds: boundsString });
    }

    position.current.copy(nextPos);
    camera.position.copy(position.current);
  });
  return null;
};

/* ============================================================
   3. CORRIDOR GEOMETRY
   ============================================================ */
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
      
      <PortalDoor cyanTiles={cyanTiles} gateConfig={gateConfig} />
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

/* ============================================================
   NATIVE MEADOW (SHUTTING ENTRY DOOR)
   ============================================================ */
const MeadowEntryDoorNative = () => {
   const doorGroup = useRef();
   const { doorOpen } = useGlobalState();
   
   // We spawn into meadow natively. The door is wide open (-100 deg) if doorOpen is true.
   // Once player sDist > 2.5, FPSController sets doorOpen to false, and we swing it shut slowly (to 0 deg).
   useFrame(() => {
      if (!doorGroup.current) return;
      if (!doorOpen) {
         doorGroup.current.rotation.y = THREE.MathUtils.damp(doorGroup.current.rotation.y, 0, 1.5, 0.016);
      } else {
         // Keep swinging open or holding open
         doorGroup.current.rotation.y = THREE.MathUtils.damp(doorGroup.current.rotation.y, -Math.PI * (100 / 180), 4, 0.016);
      }
   });

   return (
      <group position={[0, 0, 0]}>
         {/* The wall itself is rendered by MeadowScene, we just need the casing and door */}
         <DoorCasing />
         <group position={[0.475, 0, 0]} ref={doorGroup}>
            <group position={[-0.475, 0, 0]} rotation={[0, Math.PI, 0]}>
               <SixPanelDoorMesh />
            </group>
         </group>
      </group>
   );
};

/* ============================================================
   6. MAIN APPLICATION
   ============================================================ */
export default function App() {
  const [entered, setEntered] = useState(false);
  const [teleportTarget, setTeleportTarget] = useState(null);
  const [gatePrompt, setGatePrompt] = useState(false);
  const [doorOpen, setDoorOpen] = useState(false);
  const [activeScene, setActiveScene] = useState('corridor'); 
  const [playerMeadowLocalZ, setPlayerMeadowLocalZ] = useState(140);
  
  useEffect(() => {
     if (import.meta.env.DEV) {
       const params = new URLSearchParams(window.location.search);
       if (params.get('scene') === 'meadow') {
          setEntered(true);
          setActiveScene('meadow');
          
          const targetPos = new THREE.Vector3(0, 1.6, -1).applyMatrix4(gateMatrix);
          if (params.get('cam') === 'ref') {
             setTeleportTarget({ pos: targetPos, yaw: gateConfig.rotY, pitch: -0.1 });
          } else {
             setTeleportTarget({ pos: targetPos, yaw: gateConfig.rotY });
          }
       }
     }
  }, []);

  const globalState = {
     activeScene, setActiveScene,
     gatePrompt, setGatePrompt,
     doorOpen, setDoorOpen,
     playerMeadowLocalZ, setPlayerMeadowLocalZ
  };

  const [debugInfo, setDebugInfo] = useState({});
  const [doorDebug, setDoorDebug] = useState(null);
  const [showWireframes, setShowWireframes] = useState(false);
  
  useEffect(() => {
     if (import.meta.env.DEV) {
        const onKey = (e) => { if (e.code === 'KeyK') setShowWireframes(s => !s); };
        window.addEventListener('keydown', onKey);
        
        window.setDebugInfo = setDebugInfo;
        window.setDoorDebug = setDoorDebug;
        
        return () => window.removeEventListener('keydown', onKey);
     }
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
      {import.meta.env.DEV && (
         <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 100, color: 'lime', fontFamily: 'monospace', fontSize: 12, pointerEvents: 'none', background: 'rgba(0,0,0,0.5)', padding: 10 }}>
            <div>Active Scene: {activeScene}</div>
            <div>Signed Dist: {debugInfo.sDist?.toFixed(2)}</div>
            <div>Pos X: {debugInfo.x?.toFixed(2)} Z: {debugInfo.z?.toFixed(2)}</div>
            <div>Active Bounds: {debugInfo.bounds}</div>
            {doorDebug && (
               <>
                 <div>Door Dist: {doorDebug.dist?.toFixed(2)}</div>
                 <div>Ray hits door: {doorDebug.isLooking ? 'yes' : 'no'}</div>
                 <div>In range: {doorDebug.inRange ? 'yes' : 'no'}</div>
                 <div>Door state: {doorDebug.isOpen ? 'open' : 'closed'}</div>
                 <div>Portal blend: {doorDebug.blend?.toFixed(2)}</div>
                 <div>Meadow renders: {doorDebug.meadowRenders ? 'yes' : 'no'}</div>
               </>
            )}
            <div>Wireframes (K): {showWireframes ? 'ON' : 'OFF'}</div>
         </div>
      )}
      {!entered && (
        <div onClick={() => {
           setEntered(true);
           const audioEl = document.getElementById('bg-audio');
           if (audioEl) audioEl.play().catch(e => console.error("Audio play failed:", e));
        }} style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg, #5ab8d2 0%, #f99cba 100%)', cursor: 'pointer', color: '#fff', letterSpacing: '0.4em', fontSize: '15px' }}>
          CLICK TO ENTER THE DREAM
        </div>
      )}
      
      {/* Background Audio Loop (preloaded for instant playback) */}
      <audio id="bg-audio" src="/bg-loop.mp3" preload="auto" loop style={{ display: 'none' }} />
      
      {gatePrompt && activeScene === 'corridor' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', letterSpacing: '0.2em', textShadow: '0 0 10px #f99cba' }}>
          <div style={{ marginTop: '20px' }}>[ E ] OPEN</div>
        </div>
      )}

      <GlobalStateContext.Provider value={globalState}>
         <Canvas shadows camera={{ fov: 65, near: 0.01 }}>
           <color attach="background" args={[activeScene === 'meadow' ? '#0c2230' : '#2b87b5']} />
           {activeScene === 'meadow' && <fog attach="fog" args={['#0c2230', 2, 25]} />}
           <Suspense fallback={null}>
             {/* CONDITIONAL ROOT SCENE RENDERING */}
             {activeScene === 'corridor' && (
                <>
                  <Environment preset="city" background={false} blur={0.1} />
                  <WavyCorridor />
                  <OutsideScenery />
                  
                  <EffectComposer disableNormalPass>
                    <Bloom luminanceThreshold={0.75} mipmapBlur intensity={0.2} />
                    <Vignette eskil={false} offset={0.1} darkness={0.5} />
                  </EffectComposer>
                </>
             )}
             
             {activeScene === 'meadow' && (
                <>
                   {/* NATIVE MEADOW (No double tonemapping, perfectly crisp) */}
                   <group position={[gateConfig.x, 0, gateConfig.z]} rotation={[0, gateConfig.rotY, 0]}>
                      <MeadowScene />
                      <MeadowEntryDoorNative />
                   </group>
                   
                   <EffectComposer disableNormalPass>
                     <Bloom luminanceThreshold={0.9} mipmapBlur intensity={0.5} />
                     <Vignette eskil={false} offset={0.1} darkness={0.4} />
                   </EffectComposer>
                </>
             )}
             
             {entered && (
               <>
                 <PointerLockControls />
                 <FPSController teleportTarget={teleportTarget} />
               </>
             )}
           </Suspense>
         </Canvas>
      </GlobalStateContext.Provider>
    </div>
  );
}
