import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MeshPortalMaterial } from '@react-three/drei';
import { DoorCasing, SixPanelDoorMesh } from './SharedDoors';
import { PoolroomScene } from '../poolroom/PoolroomScene';
import { useGlobalState } from '../App';

export const PoolroomPortalDoor = ({ position, rotation }) => {
  const { camera } = useThree();
  const doorGroup = useRef();
  const portalRef = useRef();
  const canOpenRef = useRef(false);
  
  const [isOpen, setIsOpen] = useState(false);
  const { gatePrompt, setGatePrompt, setActiveScene } = useGlobalState();

  const doorPos = useMemo(() => new THREE.Vector3(...(position || [0,0,0])), [position]);

  const rootGroup = useRef();

  const worldPos = useRef(new THREE.Vector3());
  const forward = useRef(new THREE.Vector3());

  useFrame(() => {
     if (!rootGroup.current) return;
     
     rootGroup.current.getWorldPosition(worldPos.current);
     rootGroup.current.getWorldDirection(forward.current); 
     
     const dist = camera.position.distanceTo(worldPos.current);
     
     const diff = camera.position.clone().sub(worldPos.current);
     const sDist = diff.dot(forward.current);
     
     const lookDir = new THREE.Vector3();
     camera.getWorldDirection(lookDir);
     const toGate = worldPos.current.clone().add(new THREE.Vector3(0, 1.05, 0)).sub(camera.position).normalize();
     const isLooking = lookDir.dot(toGate) > 0.7;
     const inRange = dist < 3.5;
     
     canOpenRef.current = inRange && isLooking && !isOpen;
     
     // Gate prompt logic inside meadow scene
     if (canOpenRef.current && !gatePrompt) {
         setGatePrompt(true);
     }
     
     if (isOpen && doorGroup.current) {
        // Swing the door open (away from meadow into poolroom)
        doorGroup.current.rotation.y = THREE.MathUtils.damp(doorGroup.current.rotation.y, Math.PI * (100 / 180), 4, 0.016);
     }
     
     if (isOpen) {
        // As you walk through (sDist goes from positive to negative)
        if (sDist < 0.1 && sDist > -2.0 && dist < 3.0) {
           if (portalRef.current) {
              portalRef.current.blend = THREE.MathUtils.clamp(-sDist * 2.0, 0, 1);
           }
        }
        
        if (sDist < -0.1 && dist < 3.0) {
           setActiveScene('poolroom');
           // Keep doorOpen true conceptually for poolroom native door
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

  return (
    <group position={position} rotation={rotation} ref={rootGroup}>
       <DoorCasing />
       
       {!isOpen && (
         <group position={[0.55, 0, 0]}>
           <group position={[-0.55, 0, 0]} rotation={[0, 0, 0]}>
             <SixPanelDoorMesh />
           </group>
         </group>
       )}

       <group rotation={[0, 0, 0]}>
         <mesh position={[0, 1.05, 0]}>
           <planeGeometry args={[1.1, 2.1]} />
           <MeshPortalMaterial ref={portalRef} blend={0.0} worldUnits={true} side={THREE.DoubleSide} resolution={window.devicePixelRatio || 1}>
             <color attach="background" args={['#0c2230']} />
             <fog attach="fog" args={['#0c2230', 2, 25]} />
             
             {/* Inside Poolroom */}
             <group position={[0, -1.05, 0]}>
                <PoolroomScene />
                
                {/* Swingable Door Leaf inside portal */}
                <group position={[0.55, 0, 0]} ref={doorGroup}>
                  <group position={[-0.55, 0, 0]} rotation={[0, 0, 0]}>
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
