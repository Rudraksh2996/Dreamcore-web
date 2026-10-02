import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const Grass = ({ pathSDF }) => {
  // 7x12 room = 84 sq m. 5000 per sq m = 420,000. 
  // Let's cap at 150,000 for standard laptop 60fps, or use a LOD/density param.
  const count = 120000; 
  const meshRef = useRef();

  const [geom, mat] = useMemo(() => {
    // Tapered curved blade with 3 segments (4 vertices vertically)
    // We can use a custom BufferGeometry or a distorted PlaneGeometry.
    // A PlaneGeometry( width, height, widthSegments, heightSegments )
    const baseWidth = 0.016; // 1.6 cm
    const baseHeight = 0.08; // 8 cm
    const geometry = new THREE.PlaneGeometry(baseWidth, baseHeight, 1, 3);
    geometry.translate(0, baseHeight / 2, 0); 
    
    // Pinch the top vertices to a point
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
       const y = pos.getY(i);
       const heightPct = y / baseHeight;
       // taper width
       pos.setX(i, pos.getX(i) * (1.0 - heightPct));
       // curve forward slightly
       pos.setZ(i, pos.getZ(i) + (heightPct * heightPct) * 0.02);
    }
    geometry.computeVertexNormals();

    // Bend normals upwards for softer shading (so it doesn't look like flat paper)
    const norm = geometry.attributes.normal;
    for (let i = 0; i < norm.count; i++) {
       const y = pos.getY(i);
       const heightPct = y / baseHeight;
       norm.setXYZ(i, 0, 1.0 * heightPct + norm.getY(i) * (1 - heightPct), norm.getZ(i));
       // Not perfectly up, just blended towards up
    }
    geometry.normalizeNormals();

    const material = new THREE.MeshStandardMaterial({ 
      roughness: 0.7, 
      side: THREE.DoubleSide,
      alphaToCoverage: true // Fix jagged silhouettes if renderer has MSAA
    });

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader = `uniform float uTime;\nattribute float aPhase;\n` + shader.vertexShader;
      
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3(position);
         float heightPct = position.y / 0.08; 
         vec3 worldPos = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
         
         // Wind calculation
         float t = uTime * 1.5;
         float noise = sin(worldPos.x * 0.5 + t) * cos(worldPos.z * 0.5 + t);
         float wave = sin(worldPos.z * 1.5 - t * 1.2 + aPhase);
         
         float windStrength = (wave * 0.6 + noise * 0.4);
         float bend = heightPct * heightPct;
         
         // 3-4 cm tip displacement
         transformed.z += windStrength * bend * 0.035;
         transformed.x += windStrength * bend * 0.015; 
         
         // High freq tip flutter
         transformed.x += sin(uTime * 10.0 + aPhase) * 0.01 * (heightPct * heightPct * heightPct);
        `
      );
      
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nvarying float vHeight;\nvarying vec3 vWorldPos;\nvarying float vWindPhase;\n`)
                                               .replace('void main() {', `void main() {\nvHeight = position.y / 0.08;\nvWorldPos = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;\nvWindPhase = sin(vWorldPos.z * 1.5 - uTime * 1.5 * 1.2 + aPhase);\n`);
      
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying float vHeight;\nvarying vec3 vWorldPos;\nvarying float vWindPhase;\n`)
                                                   .replace('#include <color_fragment>', `#include <color_fragment>
         vec3 rootColor = vec3(0.125, 0.30, 0.165); // #204c2a
         vec3 midColor = vec3(0.24, 0.50, 0.22); // #3d8038
         vec3 tipColor = vec3(0.52, 0.72, 0.34); // #86b857
         
         // mix
         vec3 gradColor = mix(rootColor, midColor, smoothstep(0.0, 0.5, vHeight));
         gradColor = mix(gradColor, tipColor, smoothstep(0.5, 1.0, vHeight));
         
         // Hue/brightness jitter
         float hash = fract(sin(dot(vWorldPos.xz, vec2(12.9898, 78.233))) * 43758.5453);
         gradColor += (hash - 0.5) * 0.1;
         
         // Faint teal-pink tint
         gradColor += vec3(0.02, 0.01, 0.03); 
         
         // Wind sheen (brightness wave)
         gradColor += vWindPhase * 0.05 * vHeight;
         
         diffuseColor.rgb = gradColor;
      `);
      material.userData.shader = shader;
    };
    
    return [geometry, material];
  }, []);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    const phases = new Float32Array(count);
    
    let i = 0, attempts = 0;
    while(i < count && attempts < count * 3) {
      attempts++;
      const x = (Math.random() - 0.5) * 6.94; // 3cm clear of walls (7m wide -> 6.94)
      const z = (Math.random() - 0.5) * 11.94;
      
      const pathX = Math.sin(z * 0.5) * 1.2;
      const distToPath = Math.abs(x - pathX);
      
      // SDF masking: path is ~1.2m wide, so edge is at dist 0.6
      if (distToPath < 0.6) continue; 
      
      // Density falloff over 15cm (0.6 to 0.75)
      if (distToPath < 0.75 && Math.random() > (distToPath - 0.6) / 0.15) {
         continue; // Drop blades near edge to thin density
      }
      
      // Height scale: 6-11cm (mostly 7-9cm -> scale 0.87 to 1.12)
      let scale = 0.75 + Math.random() * 0.5;
      
      // Height falloff near path edge
      if (distToPath < 0.75) {
         scale *= THREE.MathUtils.smoothstep(distToPath, 0.6, 0.75);
      }
      
      dummy.position.set(x, 0, z);
      dummy.rotation.y = Math.random() * Math.PI * 2;
      dummy.rotation.x = (Math.random() - 0.5) * 0.1; // slight random tilt
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      
      meshRef.current.setMatrixAt(i, dummy.matrix);
      phases[i] = Math.random() * Math.PI * 2;
      i++;
    }
    meshRef.current.count = i;
    geom.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [count, geom]);

  useFrame((state) => {
    if(mat.userData.shader) mat.userData.shader.uniforms.uTime.value = state.clock.elapsedTime;
  });

  // Dark green underlay with noise
  const underlayTex = useMemo(() => {
     const cvs = document.createElement('canvas');
     cvs.width = 512; cvs.height = 512;
     const ctx = cvs.getContext('2d');
     ctx.fillStyle = '#1f4a2a';
     ctx.fillRect(0,0,512,512);
     for(let i=0; i<10000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#17361f' : '#296338';
        ctx.fillRect(Math.random()*512, Math.random()*512, 2, 2);
     }
     const t = new THREE.CanvasTexture(cvs);
     t.wrapS = t.wrapT = THREE.RepeatWrapping;
     t.repeat.set(4, 4);
     return t;
  }, []);

  return (
    <group>
      {/* Grass Instances */}
      <instancedMesh ref={meshRef} args={[geom, mat, count]} frustumCulled={false} receiveShadow castShadow />
      
      {/* Underlay */}
      <mesh position={[0, -0.005, 0]} rotation={[-Math.PI/2, 0, 0]} receiveShadow>
        <planeGeometry args={[7, 12]} />
        <meshStandardMaterial map={underlayTex} roughness={1.0} />
      </mesh>
    </group>
  );
};
