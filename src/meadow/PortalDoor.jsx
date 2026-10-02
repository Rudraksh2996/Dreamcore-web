import React, { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MeshPortalMaterial } from '@react-three/drei';
import { DoorCasing, SixPanelDoorMesh } from './SharedDoors';
import { getDoorFrame } from './DoorHelper';
import { MeadowScene } from './MeadowScene';
import { useGlobalState } from '../App';

export const PortalDoor = ({ cyanTiles, gateConfig }) => {
  const { camera } = useThree();
  const [isOpen, setIsOpen] = useState(false);
  const doorGroup = useRef();
  const portalRef = useRef();
  const canOpenRef = useRef(false);
  const { setGatePrompt, setActiveScene, setPlayerMeadowLocalZ } = useGlobalState();

  const { doorPos, forward, signedDistance } = React.useMemo(() => getDoorFrame(gateConfig), [gateConfig]);

  useFrame(() => {
     // Camera distance logic
     const dist = camera.position.distanceTo(doorPos);
     
     const sDist = signedDistance(camera.position);
     setPlayerMeadowLocalZ(sDist);
     
     const lookDir = new THREE.Vector3();
     camera.getWorldDirection(lookDir);
     const toGate = doorPos.clone().sub(camera.position).normalize();
     const isLooking = lookDir.dot(toGate) > 0.7;
     
     canOpenRef.current = dist < 3.5 && isLooking && !isOpen;
     setGatePrompt(canOpenRef.current);

     if (isOpen && doorGroup.current) {
        doorGroup.current.rotation.y = THREE.MathUtils.damp(doorGroup.current.rotation.y, -Math.PI * (100 / 180), 4, 0.016);
     }
     
     // Seamless crossing logic
     if (isOpen) {
        if (sDist > -0.1 && dist < 3.0) {
           if (portalRef.current) {
              // Blend to 1.0 right before crossing completely
              portalRef.current.blend = THREE.MathUtils.clamp(sDist * 2.0, 0, 1);
           }
        }
        // Actually swap scenes when fully crossed (e.g. sDist > 0.1)
        if (sDist > 0.1 && dist < 3.0) {
           setActiveScene('meadow');
        }
     }
  });

  useEffect(() => {
    const onAction = (e) => {
      if ((e.code === 'KeyE' || e.type === 'mousedown') && canOpenRef.current) {
         setIsOpen(true);
         setGatePrompt(false);
      }
    };
    document.addEventListener('keydown', onAction);
    document.addEventListener('mousedown', onAction);
    return () => {
      document.removeEventListener('keydown', onAction);
      document.removeEventListener('mousedown', onAction);
    };
  }, [setGatePrompt]);

  const leftWidth = 2.025;
  const rightWidth = 2.025;
  const lintelHeight = 1.1;

  // The portal mesh is just the doorway hole (0.95 x 2.1)
  return (
    <group position={[gateConfig.x, 0, gateConfig.z]} rotation={[0, gateConfig.rotY, 0]}>
       {/* Wall Pieces - Corridor Side (Cyan) */}
       <mesh position={[-0.475 - leftWidth/2, 1.6, 0.15]}><boxGeometry args={[leftWidth, 3.2, 0.3]}/><meshPhysicalMaterial {...cyanTiles} /></mesh>
       <mesh position={[0.475 + rightWidth/2, 1.6, 0.15]}><boxGeometry args={[rightWidth, 3.2, 0.3]}/><meshPhysicalMaterial {...cyanTiles} /></mesh>
       <mesh position={[0, 2.1 + lintelHeight/2, 0.15]}><boxGeometry args={[0.95, lintelHeight, 0.3]}/><meshPhysicalMaterial {...cyanTiles} /></mesh>
       
       {/* Corridor-side Casing */}
       <DoorCasing />

       {/* If closed, show a fake solid door to avoid rendering the heavy Meadow portal */}
       {!isOpen && (
         <group position={[0.475, 0, 0]}>
           <group position={[-0.475, 0, 0]}>
             <SixPanelDoorMesh />
           </group>
         </group>
       )}

       {/* The Portal (only mounts when opening) */}
       {isOpen && (
         <mesh position={[0, 1.05, 0]}>
           <planeGeometry args={[0.95, 2.1]} />
           <MeshPortalMaterial ref={portalRef} blend={0.0}>
             {/* INSIDE THE PORTAL: Isolated Meadow Scene */}
             {/* Offset so that the corridor door sits at local Z=0. Meadow is 12m long, offset by Z=-6 */}
             <group position={[0, 0, -6]}>
                <MeadowScene />
             </group>
             
             {/* Meadow-side Door Leaf and Casing (rendered inside portal so it can swing into it) */}
             <group position={[0.475, -1.05, 0]} ref={doorGroup}>
               <group position={[-0.475, 0, 0]}>
                 <SixPanelDoorMesh />
               </group>
             </group>
             
           </MeshPortalMaterial>
         </mesh>
       )}
    </group>
  );
};
