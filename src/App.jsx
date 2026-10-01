import React, { useMemo, useRef, useState, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, Environment, Sky, Clouds, Cloud, MeshTransmissionMaterial } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';

/* ============================================================
   1. PROCEDURAL TILE TEXTURE GENERATOR
   ============================================================ */
function useTileMaterial(color, groutColor = '#e2eeef') {
  const tex = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = groutColor;
    ctx.fillRect(0, 0, 512, 512);
    
    // Thinner grout lines
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
    texture.repeat.set(2, 2); // 2 tiles per world unit
    texture.anisotropy = 16;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [color, groutColor]);

  return {
    map: tex,
    roughness: 0.22,
    metalness: 0.0,
    clearcoat: 0.35,
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
    position.current.add(worldVelocity);

    const z = position.current.z;
    const pathCenter = Math.sin(z * 0.1) * 2.0 + 4.75;
    const minX = pathCenter - 1.8; 
    const maxX = pathCenter + 1.8; 
    
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

  const { leftWallGeoms, trim, rightWall, floor, ceiling, water, waterBase } = useMemo(() => {
    // --- Left Wall (Segmented to prevent long triangles crossing the curve) ---
    const segmentedLeftWalls = [];
    const segLength = length / numPortholes;
    
    for (let i = 0; i < numPortholes; i++) {
      const startX = i * segLength;
      const endX = (i + 1) * segLength;
      
      const shape = new THREE.Shape();
      shape.moveTo(startX, 0);
      for(let x = startX + 0.5; x <= endX; x += 0.5) shape.lineTo(x, 0);
      for(let y = 1; y <= 8; y += 1) shape.lineTo(endX, y);
      for(let x = endX - 0.5; x >= startX; x -= 0.5) shape.lineTo(x, 8);
      for(let y = 7; y > 0; y -= 1) shape.lineTo(startX, y);

      const hole = new THREE.Path();
      const xCenter = startX + segLength / 2;
      hole.absarc(xCenter, 4, 2.6, 0, Math.PI * 2, false);
      shape.holes.push(hole);

      const geom = new THREE.ExtrudeGeometry(shape, { depth: 1.5, bevelEnabled: false, curveSegments: 32 });
      
      const lPos = geom.attributes.position;
      for(let j = 0; j < lPos.count; j++) {
         const x = lPos.getX(j); 
         const y = lPos.getY(j); 
         const z = lPos.getZ(j); 
         const z_world = -x;
         const x_world = Math.sin(z_world * 0.1) * 2.0 + 2 + (z - 1.5);
         lPos.setXYZ(j, x_world, y, z_world);
      }
      applyWorldUVs(geom);
      segmentedLeftWalls.push(geom);
    }

    // --- Procedural Solid Structures (Highly Subdivided Boxes) ---
    const trimGeom = new THREE.BoxGeometry(0.4, 0.5, length, 2, 1, length);
    trimGeom.translate(0.2, 0.25, -length / 2);
    applyWorldUVs(trimGeom);

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

    const geometries = [trimGeom, rightGeom, floorGeom, ceilGeom, waterGeom, waterBaseGeom];
    geometries.forEach(geom => {
      const pos = geom.attributes.position;
      for(let i = 0; i < pos.count; i++) {
        pos.setX(i, pos.getX(i) + Math.sin(pos.getZ(i) * 0.1) * 2.0);
      }
      geom.computeVertexNormals();
    });

    return { leftWallGeoms: segmentedLeftWalls, trim: trimGeom, rightWall: rightGeom, floor: floorGeom, ceiling: ceilGeom, water: waterGeom, waterBase: waterBaseGeom };
  }, [length, numPortholes]);

  const pinkTiles = useTileMaterial('#f99cba', '#e2eeef');
  const cyanTiles = useTileMaterial('#5ab8d2', '#e2eeef');
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

      {leftWallGeoms.map((geom, idx) => (
        <mesh key={`wall-${idx}`} geometry={geom} castShadow receiveShadow>
          <meshPhysicalMaterial {...cyanTiles} />
        </mesh>
      ))}

      <mesh geometry={trim} receiveShadow>
        <meshStandardMaterial color="#fff3d1" roughness={0.4} />
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
    <group position={[-60, -15, -40]}>
      {/* Vibrant Sky Gradient: bright azure top, glowing warm horizon */}
      <Sky sunPosition={[-100, 2, 20]} turbidity={0.1} rayleigh={0.1} mieCoefficient={0.001} mieDirectionalG={0.9} />
      
      {/* Sunset Highlights: warm gold directional light on the clouds */}
      <directionalLight position={[-80, 20, 10]} intensity={5.0} color="#ffdd99" castShadow />
      
      {/* Sea of Clouds: Strictly bounded outside the window to prevent interior clipping */}
      <Clouds material={THREE.MeshLambertMaterial} limit={400}>
        <Cloud seed={1} segments={100} bounds={[80, 15, 160]} volume={80} color="#4a88b5" position={[0, -5, 0]} opacity={0.9} />
        <Cloud seed={2} segments={80} bounds={[70, 10, 150]} volume={60} color="#8bb8d6" position={[-10, 2, 10]} opacity={0.8} />
        <Cloud seed={3} segments={80} bounds={[60, 8, 140]} volume={50} color="#ffffff" position={[-5, 8, -10]} opacity={0.9} />
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
        <color attach="background" args={['#87CEEB']} />
        <Suspense fallback={null}>
          <ambientLight intensity={0.6} color="#c9e2ff" />
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
            <Bloom luminanceThreshold={0.75} mipmapBlur intensity={0.2} />
            <Vignette eskil={false} offset={0.1} darkness={0.5} />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  );
}
