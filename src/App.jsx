import React, { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { 
  PointerLockControls, 
  Environment, 
  Sky, 
  Clouds, 
  Cloud,
  MeshTransmissionMaterial
} from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';

/* ============================================================
   1. PROCEDURAL TILE TEXTURE GENERATOR
   ============================================================ */
function useTileMaterial(color, groutColor = '#ffffff', repeatX = 1, repeatY = 1, tileSize = 512) {
  const tex = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = tileSize;
    canvas.height = tileSize;
    const ctx = canvas.getContext('2d');
    
    // Grout background[cite: 14]
    ctx.fillStyle = groutColor;
    ctx.fillRect(0, 0, tileSize, tileSize);
    
    // Tile face
    const padding = tileSize * 0.03;
    ctx.fillStyle = color;
    ctx.fillRect(padding, padding, tileSize - padding * 2, tileSize - padding * 2);
    
    // Glossy bevel highlight for realism[cite: 14]
    const grad = ctx.createLinearGradient(padding, padding, tileSize, tileSize);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
    grad.addColorStop(0.15, 'rgba(255, 255, 255, 0.0)');
    grad.addColorStop(0.85, 'rgba(0, 0, 0, 0.0)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
    ctx.fillStyle = grad;
    ctx.fillRect(padding, padding, tileSize - padding * 2, tileSize - padding * 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.anisotropy = 16;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [color, groutColor, repeatX, repeatY, tileSize]);

  return {
    map: tex,
    roughness: 0.02,
    metalness: 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  };
}

/* ============================================================
   2. CONTINUOUS WAVY CORRIDOR GEOMETRY
   ============================================================ */
const WavyCorridor = () => {
  const length = 120;
  const segments = 150;
  
  // Custom Shapes for perfectly flush Wavy Floor and Water[cite: 14]
  const { floorGeom, waterGeom } = useMemo(() => {
    const fShape = new THREE.Shape();
    const wShape = new THREE.Shape();
    
    fShape.moveTo(3, 0);
    wShape.moveTo(-2, 0);
    
    // Generate sweeping sine wave curve for the path boundary[cite: 14]
    for (let i = 0; i <= segments; i++) {
      const z = -(i / segments) * length;
      const xOffset = Math.sin(z * 0.12) * 1.8 + 2; 
      fShape.lineTo(xOffset, z);
      wShape.lineTo(xOffset, z);
    }
    
    fShape.lineTo(10, -length);
    fShape.lineTo(10, 0);
    
    wShape.lineTo(-2, -length);
    wShape.lineTo(-2, 0);

    return {
      floorGeom: new THREE.ShapeGeometry(fShape),
      waterGeom: new THREE.ShapeGeometry(wShape)
    };
  }, [length, segments]);

  const pinkTiles = useTileMaterial('#f99cba', '#ffffff', 12, 120);
  const cyanTiles = useTileMaterial('#5ab8d2', '#ffffff', 30, 8);
  const ceilingMaterial = new THREE.MeshStandardMaterial({ color: '#fff9e6', roughness: 0.4 });
  
  const wallDepth = 0.8; // Thick architectural sills[cite: 14]
  const numPortholes = 10;
  const segmentLength = length / numPortholes;
  
  return (
    <group>
      {/* Seamless Wavy Pink Tile Floor[cite: 14] */}
      <mesh geometry={floorGeom} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <meshPhysicalMaterial {...pinkTiles} />
      </mesh>

      {/* Refractive Water Channel nestled in the curve[cite: 14] */}
      <mesh geometry={waterGeom} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, 0]}>
        <MeshTransmissionMaterial 
          background={new THREE.Color('#5ab8d2')}
          transmission={0.95} thickness={1.2} roughness={0.05} 
          chromaticAberration={0.03} color="#90e0ef"
        />
      </mesh>

      {/* Continuous Solid Cyan Right Wall[cite: 14] */}
      <mesh position={[8, 3, -length/2]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[length, 6]} />
        <meshPhysicalMaterial {...cyanTiles} />
      </mesh>

      {/* Continuous Sweeping Porthole Left Wall[cite: 14] */}
      {Array.from({ length: numPortholes }).map((_, i) => {
        const zCenter = -(i * segmentLength) - (segmentLength / 2);
        // Calculate the curve position and tangent angle to make pieces interlock seamlessly
        const xOffset = Math.sin(zCenter * 0.12) * 1.8 + 2;
        const angle = Math.atan(Math.cos(zCenter * 0.12) * 0.12 * 1.8);
        
        const wallShape = new THREE.Shape();
        const halfW = (segmentLength / 2) + 0.1; // overlap slightly to prevent gaps
        wallShape.moveTo(-halfW, 0);
        wallShape.lineTo(halfW, 0);
        wallShape.lineTo(halfW, 6);
        wallShape.lineTo(-halfW, 6);
        
        const hole = new THREE.Path();
        hole.absarc(0, 3, 2.2, 0, Math.PI * 2, false); // Large circular cutout[cite: 14]
        wallShape.holes.push(hole);
        
        const segmentGeom = new THREE.ExtrudeGeometry(wallShape, { depth: wallDepth, bevelEnabled: false });

        return (
          <mesh 
            key={i} 
            geometry={segmentGeom} 
            position={[xOffset - 2, 0, zCenter]} 
            rotation={[0, angle, 0]}
            castShadow receiveShadow
          >
            <meshPhysicalMaterial {...cyanTiles} />
          </mesh>
        );
      })}

      {/* Solid Enclosed Warm Ceiling[cite: 14] */}
      <mesh position={[3, 6, -length/2]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[10, length]} />
        <primitive object={ceilingMaterial} attach="material" />
      </mesh>

      {/* Glowing Recessed Ceiling Lights[cite: 14] */}
      {Array.from({ length: 12 }).map((_, i) => {
        const z = -4 - (i * 10);
        return (
          <group key={`light-${i}`} position={[4.5, 5.98, z]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.35, 32]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
            <pointLight intensity={1.8} color="#ffebba" distance={12} decay={2} />
          </group>
        );
      })}

      {/* Distant Arched Destination[cite: 14] */}
      <mesh position={[5, 3, -length + 0.5]}>
        <planeGeometry args={[4, 6]} />
        <meshPhysicalMaterial {...pinkTiles} />
      </mesh>
      <mesh position={[5, 1.5, -length + 0.6]}>
        <circleGeometry args={[1.5, 32]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
    </group>
  );
};

/* ============================================================
   3. VOLUMETRIC SKY & ENVIRONMENT
   ============================================================ */
const OutsideScenery = () => {
  return (
    <group position={[-25, -2, -50]}>
      {/* Vibrant Sunset Sky[cite: 14] */}
      <Sky sunPosition={[-30, 2, 20]} turbidity={0.6} rayleigh={1.2} mieCoefficient={0.005} />
      
      {/* Dense Volumetric Clouds visible through portholes[cite: 14] */}
      <Clouds material={THREE.MeshBasicMaterial}>
        <Cloud seed={1} segments={60} bounds={[40, 15, 100]} volume={30} color="#ffdac2" position={[0, -2, 0]} />
        <Cloud seed={2} segments={40} bounds={[30, 20, 80]} volume={25} color="#b3cfff" position={[-5, -10, 20]} />
      </Clouds>
    </group>
  );
};

/* ============================================================
   4. MAIN APPLICATION
   ============================================================ */
export default function App() {
  const [entered, setEntered] = useState(false);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
      {!entered && (
        <div onClick={() => setEntered(true)} style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg, #5ab8d2 0%, #f99cba 100%)', cursor: 'pointer', color: '#fff', letterSpacing: '0.4em', fontSize: '15px' }}>
          ENTER THE DREAM
        </div>
      )}

      <Canvas shadows camera={{ position: [5, 2, 5], fov: 60 }}>
        <ambientLight intensity={0.6} color="#ffffff" />
        
        {/* Soft HDRI reflections for the extreme glossy wet look[cite: 14] */}
        <Environment preset="city" background={false} blur={0.1} />

        <WavyCorridor />
        <OutsideScenery />

        {entered && <PointerLockControls />}

        <EffectComposer disableNormalPass>
          <Bloom luminanceThreshold={0.8} mipmapBlur intensity={1.5} />
          <Vignette eskil={false} offset={0.1} darkness={0.45} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
