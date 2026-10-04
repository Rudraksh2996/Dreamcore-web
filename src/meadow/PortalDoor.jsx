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
  const doorGroup = useRef();
  const portalRef = useRef();
  const canOpenRef = useRef(false);
  const { gatePrompt, setGatePrompt, setActiveScene, setPlayerMeadowLocalZ, doorOpen: isOpen, setDoorOpen: setIsOpen } = useGlobalState();

  const { doorPos, forward, signedDistance } = React.useMemo(() => getDoorFrame(gateConfig), [gateConfig]);

  useFrame(() => {
     // Camera distance logic
     const dist = camera.position.distanceTo(doorPos);
     
     const sDist = signedDistance(camera.position);
     if (Math.abs(window._lastSDist - sDist) > 0.05) {
        setPlayerMeadowLocalZ(sDist);
        window._lastSDist = sDist;
     }
     
     const lookDir = new THREE.Vector3();
     camera.getWorldDirection(lookDir);
     const toGate = doorPos.clone().add(new THREE.Vector3(0, 1.05, 0)).sub(camera.position).normalize();
     const isLooking = lookDir.dot(toGate) > 0.7;
     const inRange = dist < 3.5;
     
     canOpenRef.current = inRange && isLooking && !isOpen;
     // Don't flutter the prompt unnecessarily
     if (canOpenRef.current !== gatePrompt) {
         setGatePrompt(canOpenRef.current);
     }

     if (isOpen && doorGroup.current) {
        doorGroup.current.rotation.y = THREE.MathUtils.damp(doorGroup.current.rotation.y, Math.PI * (100 / 180), 4, 0.016);
     }
     
     let blendVal = 0.0;
     // Seamless crossing logic
     if (isOpen) {
        if (sDist > -0.1 && dist < 3.0) {
           if (portalRef.current) {
              blendVal = THREE.MathUtils.clamp(sDist * 2.0, 0, 1);
              portalRef.current.blend = blendVal;
           }
        }
        // Actually swap scenes when fully crossed (e.g. sDist > 0.0)
        if (sDist > 0.0 && dist < 3.0) {
           setActiveScene('meadow');
        }
     }
     
     if (window.setDoorDebug) {
        window.setDoorDebug({ dist, isLooking, inRange, isOpen, blend: blendVal, meadowRenders: isOpen });
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

  const leftWidth = 2.45;
  const rightWidth = 2.45;
  const lintelHeight = 5.9; // 8.0 - 2.1

  // The portal mesh is just the doorway hole (1.1 x 2.1)
  return (
    <group position={[gateConfig.x, 0, gateConfig.z]} rotation={[0, gateConfig.rotY, 0]}>
       {/* Wall Pieces - Corridor Side (Cyan) */}
       <mesh position={[-0.55 - leftWidth/2, 4.0, 0.075]}><boxGeometry args={[leftWidth, 8.0, 0.15]}/><meshPhysicalMaterial {...cyanTiles} /></mesh>
       <mesh position={[0.55 + rightWidth/2, 4.0, 0.075]}><boxGeometry args={[rightWidth, 8.0, 0.15]}/><meshPhysicalMaterial {...cyanTiles} /></mesh>
       <mesh position={[0, 2.1 + lintelHeight/2, 0.075]}><boxGeometry args={[1.1, lintelHeight, 0.15]}/><meshPhysicalMaterial {...cyanTiles} /></mesh>
       
       {/* Corridor-side Casing */}
       <DoorCasing />
       
       <pointLight position={[0, 2, -2]} intensity={2.0} color="#ffffff" distance={10} decay={2} />

       {/* If closed, show a fake solid door to avoid rendering the heavy Meadow portal */}
       {!isOpen && (
         <group position={[0.55, 0, 0]}>
           <group position={[-0.55, 0, 0]} rotation={[0, Math.PI, 0]}>
             <SixPanelDoorMesh />
           </group>
         </group>
       )}

       {/* The Portal (always mounted, but hidden if far away and closed) */}
       <group rotation={[0, Math.PI, 0]}>
         <mesh position={[0, 1.05, 0]} visible={isOpen || camera.position.distanceTo(doorPos) <= 45}>
           <planeGeometry args={[1.1, 2.1]} />
           <MeshPortalMaterial ref={portalRef} blend={0.0} worldUnits={true} side={THREE.DoubleSide} resolution={window.devicePixelRatio || 1}>
             <color attach="background" args={['#0c2230']} />
             <fog attach="fog" args={['#0c2230', 2, 25]} />
             {/* INSIDE THE PORTAL: Isolated Meadow Scene */}
             {/* The portal mesh is at Y=1.05. We offset by Y=-1.05 so the Meadow's origin is flush with the floor. */}
             <group position={[0, -1.05, 0]}>
                <MeadowScene />
                
                {/* Meadow-side Door Leaf and Casing (rendered inside portal so it can swing into it) */}
                <group position={[-0.55, 0, 0]} ref={doorGroup}>
                  <group position={[0.55, 0, 0]} rotation={[0, 0, 0]}>
                    <SixPanelDoorMesh />
                  </group>
                </group>
             </group>
           </MeshPortalMaterial>
         </mesh>
       </group>
    </group>
  );
};
