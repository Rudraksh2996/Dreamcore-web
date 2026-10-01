import React, { useMemo, useRef, useState, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, Environment, Sky, Clouds, Cloud, MeshTransmissionMaterial } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';

/* ============================================================
   1. PROCEDURAL TILE TEXTURE GENERATOR
   ============================================================ */
function useTileMaterial(color, groutColor = '#ffffff') {
  const tex = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = groutColor;
    ctx.fillRect(0, 0, 512, 512);
    
    const padding = 512 * 0.04;
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
    texture.repeat.set(2, 2); // 2 tiles per world unit
    texture.anisotropy = 16;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [color, groutColor]);

  return {
    map: tex,
    roughness: 0.05,
    metalness: 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
  };
}

/* ============================================================
   2. CUSTOM FPS CONTROLLER (PURE THREE.JS)
   ============================================================ */
const FPSController = () => {
  const camera = useThree(state => state.camera);
  const moveState = useRef({ forward: false, backward: false, left: false, right: false });
  const velocity = useRef(new THREE.Vector3());
  const position = useRef(new THREE.Vector3(4.75, 2, -2)); // Spawn looking down -Z

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

  useFrame((_, delta) => {
    // Cap delta to avoid physics explosions on lag spikes
    const dt = Math.min(delta, 0.1); 
    const speed = 12.0;
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
    position.current.add(worldVelocity);

    // Procedural Collision Constraints
    const z = position.current.z;
    const pathCenter = Math.sin(z * 0.1) * 2.0 + 4.75;
    const minX = pathCenter - 1.8; // Edge of the water channel
    const maxX = pathCenter + 1.8; // Edge of the right wall
    
    if (position.current.x < minX) {
      position.current.x = minX;
      velocity.current.x = 0;
    }
    if (position.current.x > maxX) {
      position.current.x = maxX;
      velocity.current.x = 0;
    }
    if (position.current.z > -1) position.current.z = -1;
    if (position.current.z < -138) position.current.z = -138;

    camera.position.copy(position.current);
  });

  return null;
};

/* ============================================================
   3. CONTINUOUS WAVY CORRIDOR GEOMETRY (NATIVE THREE.JS)
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
     
     if (ny > 0.5) uv.setXY(i, x, z); // Top/Bottom faces
     else if (nx > 0.5) uv.setXY(i, z, y); // Left/Right faces
     else uv.setXY(i, x, y); // Front/Back faces
  }
}

const WavyCorridor = () => {
  const length = 140;
  const numPortholes = 12;

  const { leftWall, rightWall, floor, ceiling, water, waterBase } = useMemo(() => {
    // --- Left Wall (Extrude Geometry with Native Holes) ---
    const shape = new THREE.Shape();
    for(let x = 0; x <= length; x += 1) { if(x === 0) shape.moveTo(0,0); else shape.lineTo(x,0); }
    for(let y = 1; y <= 8; y += 1) shape.lineTo(length, y);
    for(let x = length - 1; x >= 0; x -= 1) shape.lineTo(x, 8);
    for(let y = 7; y > 0; y -= 1) shape.lineTo(0, y);

    for (let i = 0; i < numPortholes; i++) {
      const hole = new THREE.Path();
      const xCenter = (i + 0.5) * (length / numPortholes);
      hole.absarc(xCenter, 4, 2.6, 0, Math.PI * 2, false);
      shape.holes.push(hole);
    }
    const leftGeom = new THREE.ExtrudeGeometry(shape, { depth: 1.5, bevelEnabled: false, curveSegments: 32 });
    
    // Distort Left Wall Vertices (Bend around Sine Wave)
    const lPos = leftGeom.attributes.position;
    for(let i = 0; i < lPos.count; i++) {
       const x = lPos.getX(i); // length (0 to 140)
       const y = lPos.getY(i); // height (0 to 8)
       const z = lPos.getZ(i); // thickness (0 to 1.5)
       const z_world = -x;
       const x_world = Math.sin(z_world * 0.1) * 2.0 + 2 + (z - 1.5);
       lPos.setXYZ(i, x_world, y, z_world);
    }
    leftGeom.computeVertexNormals();

    // --- Procedural Solid Structures (Highly Subdivided Boxes) ---
    const rightGeom = new THREE.BoxGeometry(1.5, 8, length, 1, 1, length);
    rightGeom.translate(7.75, 4, -length / 2);
    applyWorldUVs(rightGeom);
    
    const floorGeom = new THREE.BoxGeometry(4.5, 0.2, length, 4, 1, length);
    floorGeom.translate(4.75, -0.1, -length / 2);
    applyWorldUVs(floorGeom);
    
    const ceilGeom = new THREE.BoxGeometry(10, 0.5, length, 10, 1, length);
    ceilGeom.translate(3.5, 8.25, -length / 2);
    applyWorldUVs(ceilGeom);
    
    const waterGeom = new THREE.BoxGeometry(2.5, 0.8, length, 2, 1, length);
    waterGeom.translate(1.25, -0.4, -length / 2);
    applyWorldUVs(waterGeom);
    
    const waterBaseGeom = new THREE.BoxGeometry(2.5, 0.2, length, 2, 1, length);
    waterBaseGeom.translate(1.25, -0.9, -length / 2);
    applyWorldUVs(waterBaseGeom);

    // Apply exact same sine wave vertex distortion to all structures perfectly
    const geometries = [rightGeom, floorGeom, ceilGeom, waterGeom, waterBaseGeom];
    geometries.forEach(geom => {
      const pos = geom.attributes.position;
      for(let i = 0; i < pos.count; i++) {
        pos.setX(i, pos.getX(i) + Math.sin(pos.getZ(i) * 0.1) * 2.0);
      }
      geom.computeVertexNormals();
    });

    return { leftWall: leftGeom, rightWall: rightGeom, floor: floorGeom, ceiling: ceilGeom, water: waterGeom, waterBase: waterBaseGeom };
  }, [length, numPortholes]);

  const pinkTiles = useTileMaterial('#f99cba', '#ffffff');
  const cyanTiles = useTileMaterial('#5ab8d2', '#ffffff');
  const ceilingMaterial = new THREE.MeshStandardMaterial({ color: '#fff9e6', roughness: 0.4 });

  return (
    <group>
      <mesh geometry={floor} receiveShadow>
        <meshPhysicalMaterial {...pinkTiles} />
      </mesh>
      
      <mesh geometry={water}>
        <MeshTransmissionMaterial 
          background={new THREE.Color('#5ab8d2')}
          transmission={0.95} thickness={1.5} roughness={0.02} 
          chromaticAberration={0.04} color="#90e0ef"
        />
      </mesh>

      <mesh geometry={waterBase} receiveShadow>
        <meshPhysicalMaterial {...cyanTiles} />
      </mesh>

      <mesh geometry={rightWall} receiveShadow>
        <meshPhysicalMaterial {...cyanTiles} />
      </mesh>

      <mesh geometry={leftWall} castShadow receiveShadow>
        <meshPhysicalMaterial {...cyanTiles} />
      </mesh>

      <mesh geometry={ceiling} receiveShadow>
        <primitive object={ceilingMaterial} attach="material" />
      </mesh>

      {/* Embedded Ceiling Lights */}
      {Array.from({ length: 14 }).map((_, i) => {
        const z = -2 - (i * 10);
        const x = Math.sin(z * 0.1) * 2.0 + 4.75;
        return (
          <group key={`light-${i}`} position={[x, 7.98, z]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.4, 32]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
            <pointLight intensity={2.0} color="#ffebba" distance={15} decay={2} />
          </group>
        );
      })}

      {/* Enclosed Start & End Walls */}
      <mesh position={[4.5, 4, -length - 2]}>
        <boxGeometry args={[14, 8, 2]} />
        <meshPhysicalMaterial {...cyanTiles} />
      </mesh>
      <mesh position={[4.5, 4, 2]}>
        <boxGeometry args={[14, 8, 2]} />
        <meshPhysicalMaterial {...cyanTiles} />
      </mesh>
    </group>
  );
};

/* ============================================================
   4. VOLUMETRIC SKY & ENVIRONMENT
   ============================================================ */
const OutsideScenery = () => {
  return (
    <group position={[-25, -2, -60]}>
      <Sky sunPosition={[-30, 2, 20]} turbidity={0.7} rayleigh={1.5} mieCoefficient={0.005} />
      <Clouds material={THREE.MeshBasicMaterial}>
        <Cloud seed={1} segments={80} bounds={[50, 20, 120]} volume={40} color="#ffdac2" position={[0, 0, 0]} />
        <Cloud seed={2} segments={50} bounds={[40, 25, 100]} volume={30} color="#b3cfff" position={[-5, -10, 20]} />
      </Clouds>
    </group>
  );
};

/* ============================================================
   5. MAIN APPLICATION
   ============================================================ */
export default function App() {
  const [entered, setEntered] = useState(false);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
      {!entered && (
        <div onClick={() => setEntered(true)} style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg, #5ab8d2 0%, #f99cba 100%)', cursor: 'pointer', color: '#fff', letterSpacing: '0.4em', fontSize: '15px' }}>
          CLICK TO ENTER THE DREAM
        </div>
      )}

      <Canvas shadows camera={{ fov: 65 }}>
        <Suspense fallback={null}>
          <ambientLight intensity={0.8} color="#ffffff" />
          <Environment preset="city" background={false} blur={0.1} />

          <WavyCorridor />
          <OutsideScenery />
          
          {entered && (
            <>
              <PointerLockControls />
              <FPSController />
            </>
          )}

          <EffectComposer disableNormalPass>
            <Bloom luminanceThreshold={0.75} mipmapBlur intensity={1.8} />
            <Vignette eskil={false} offset={0.1} darkness={0.5} />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  );
}
