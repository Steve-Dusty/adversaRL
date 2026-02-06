'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface RobotVisualizationProps {
  jointAngles: number[];
  endEffectorPos: { x: number; y: number; z: number };
  gripperState: 'open' | 'closed';
}

interface TargetBlock {
  position: THREE.Vector3;
  mesh: THREE.Mesh;
}

export default function RobotVisualization({
  jointAngles,
  endEffectorPos,
  gripperState
}: RobotVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    joints: THREE.Group[];
    targetBlocks: TargetBlock[];
    currentTarget: number;
    phase: 'reaching' | 'grasping' | 'lifting' | 'moving' | 'placing';
    phaseTime: number;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(0x000000, 5, 20);

    const camera = new THREE.PerspectiveCamera(
      50,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      100
    );
    camera.position.set(2, 2, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    containerRef.current.appendChild(renderer.domElement);

    // Orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1;
    controls.maxDistance = 10;
    controls.target.set(0, 0.8, 0);
    controls.update();

    // Cyberpunk grid floor
    const gridSize = 10;
    const gridDivisions = 20;
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x00ffff, 0xff00ff);
    gridHelper.position.y = -0.01;
    gridHelper.material.opacity = 0.3;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    // Neon grid glow effect
    const glowGeometry = new THREE.PlaneGeometry(gridSize, gridSize);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.05,
      side: THREE.DoubleSide
    });
    const glowPlane = new THREE.Mesh(glowGeometry, glowMaterial);
    glowPlane.rotation.x = -Math.PI / 2;
    glowPlane.position.y = -0.02;
    scene.add(glowPlane);

    // Lighting - cyberpunk style
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);

    // Cyan rim light
    const cyanLight = new THREE.DirectionalLight(0x00ffff, 1.5);
    cyanLight.position.set(-3, 4, 2);
    cyanLight.castShadow = true;
    scene.add(cyanLight);

    // Magenta accent light
    const magentaLight = new THREE.DirectionalLight(0xff00ff, 1.2);
    magentaLight.position.set(3, 3, -2);
    scene.add(magentaLight);

    // Spot light from above
    const spotLight = new THREE.SpotLight(0xffffff, 0.8);
    spotLight.position.set(0, 5, 0);
    spotLight.angle = Math.PI / 6;
    spotLight.penumbra = 0.3;
    spotLight.castShadow = true;
    scene.add(spotLight);

    // Create robot with proper kinematic chain
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0a0f,
      metalness: 0.9,
      roughness: 0.2,
      emissive: 0x00ffff,
      emissiveIntensity: 0.2
    });

    const jointMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      metalness: 0.8,
      roughness: 0.3,
      emissive: 0xff00ff,
      emissiveIntensity: 0.3
    });

    const linkMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f0f1e,
      metalness: 0.7,
      roughness: 0.4,
      emissive: 0x00ffff,
      emissiveIntensity: 0.15
    });

    // Kinematic chain: each joint is a child of the previous
    const joints: THREE.Group[] = [];

    // Base (J0 - base rotation)
    const j0 = new THREE.Group();
    j0.position.y = 0;
    scene.add(j0);
    joints.push(j0);

    const baseGeom = new THREE.CylinderGeometry(0.15, 0.2, 0.1, 16);
    const baseMesh = new THREE.Mesh(baseGeom, baseMaterial);
    baseMesh.position.y = 0.05;
    baseMesh.castShadow = true;
    j0.add(baseMesh);

    // J1 - shoulder (pitch)
    const j1 = new THREE.Group();
    j1.position.y = 0.15;
    j0.add(j1);
    joints.push(j1);

    const joint1Geom = new THREE.SphereGeometry(0.09, 16, 16);
    const joint1Mesh = new THREE.Mesh(joint1Geom, jointMaterial);
    joint1Mesh.castShadow = true;
    j1.add(joint1Mesh);

    // Glow sphere for J1
    const glow1 = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.15 })
    );
    j1.add(glow1);

    // Link1
    const link1Geom = new THREE.BoxGeometry(0.08, 0.5, 0.08);
    const link1Mesh = new THREE.Mesh(link1Geom, linkMaterial);
    link1Mesh.position.y = 0.25;
    link1Mesh.castShadow = true;
    j1.add(link1Mesh);

    // J2 - elbow
    const j2 = new THREE.Group();
    j2.position.y = 0.5;
    j1.add(j2);
    joints.push(j2);

    const joint2Mesh = new THREE.Mesh(joint1Geom, jointMaterial);
    joint2Mesh.castShadow = true;
    j2.add(joint2Mesh);

    const glow2 = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.15 })
    );
    j2.add(glow2);

    // Link2
    const link2Mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.4, 0.07),
      linkMaterial
    );
    link2Mesh.position.y = 0.2;
    link2Mesh.castShadow = true;
    j2.add(link2Mesh);

    // J3 - wrist1
    const j3 = new THREE.Group();
    j3.position.y = 0.4;
    j2.add(j3);
    joints.push(j3);

    const joint3Mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 16),
      jointMaterial
    );
    joint3Mesh.castShadow = true;
    j3.add(joint3Mesh);

    const glow3 = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.15 })
    );
    j3.add(glow3);

    // Link3
    const link3Mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.25, 0.06),
      linkMaterial
    );
    link3Mesh.position.y = 0.125;
    link3Mesh.castShadow = true;
    j3.add(link3Mesh);

    // J4 - wrist2
    const j4 = new THREE.Group();
    j4.position.y = 0.25;
    j3.add(j4);
    joints.push(j4);

    const joint4Mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 16, 16),
      jointMaterial
    );
    joint4Mesh.castShadow = true;
    j4.add(joint4Mesh);

    // Link4
    const link4Mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.15, 0.055),
      linkMaterial
    );
    link4Mesh.position.y = 0.075;
    link4Mesh.castShadow = true;
    j4.add(link4Mesh);

    // J5 - wrist3
    const j5 = new THREE.Group();
    j5.position.y = 0.15;
    j4.add(j5);
    joints.push(j5);

    const joint5Mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 16, 16),
      jointMaterial
    );
    joint5Mesh.castShadow = true;
    j5.add(joint5Mesh);

    // Gripper (end effector)
    const gripperMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0a0f,
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0xffff00,
      emissiveIntensity: 0.4
    });

    const gripperMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.08, 0.04),
      gripperMaterial
    );
    gripperMesh.position.y = 0.08;
    gripperMesh.castShadow = true;
    j5.add(gripperMesh);

    const gripperGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.15 })
    );
    gripperGlow.position.y = 0.08;
    j5.add(gripperGlow);

    // Add blocks/cubes on the table (matching THE WORLD side)
    const blockMaterial = new THREE.MeshStandardMaterial({
      color: 0xff1744, // Red color matching left side
      metalness: 0.3,
      roughness: 0.6,
      emissive: 0xff1744,
      emissiveIntensity: 0.1
    });

    // Main red cube (target object)
    const mainCube = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.1),
      blockMaterial
    );
    mainCube.position.set(0.5, 0.05, 0);
    mainCube.castShadow = true;
    mainCube.receiveShadow = true;
    scene.add(mainCube);

    // Cube glow effect
    const cubeGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.12),
      new THREE.MeshBasicMaterial({
        color: 0xff1744,
        transparent: true,
        opacity: 0.2,
        side: THREE.BackSide
      })
    );
    cubeGlow.position.copy(mainCube.position);
    scene.add(cubeGlow);

    // Additional blocks for variety
    const blockMaterial2 = new THREE.MeshStandardMaterial({
      color: 0x00e5ff, // Cyan block
      metalness: 0.3,
      roughness: 0.6,
      emissive: 0x00e5ff,
      emissiveIntensity: 0.1
    });

    const cube2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.08),
      blockMaterial2
    );
    cube2.position.set(-0.4, 0.04, 0.3);
    cube2.rotation.y = 0.3;
    cube2.castShadow = true;
    scene.add(cube2);

    const blockMaterial3 = new THREE.MeshStandardMaterial({
      color: 0xff00ff, // Magenta block
      metalness: 0.3,
      roughness: 0.6,
      emissive: 0xff00ff,
      emissiveIntensity: 0.1
    });

    const cube3 = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.09, 0.09),
      blockMaterial3
    );
    cube3.position.set(0.3, 0.045, -0.4);
    cube3.rotation.y = -0.5;
    cube3.castShadow = true;
    scene.add(cube3);

    // Target box/zone indicator
    const targetMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      metalness: 0.2,
      roughness: 0.8,
      transparent: true,
      opacity: 0.3,
      emissive: 0x00ff00,
      emissiveIntensity: 0.2
    });

    const targetBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.15, 0.25),
      targetMaterial
    );
    targetBox.position.set(-0.6, 0.075, -0.3);
    scene.add(targetBox);

    // Target box outline
    const edges = new THREE.EdgesGeometry(targetBox.geometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
    const targetOutline = new THREE.LineSegments(edges, lineMaterial);
    targetOutline.position.copy(targetBox.position);
    scene.add(targetOutline);

    // Store references with target blocks for intelligent animation
    const targetBlocks: TargetBlock[] = [
      { position: mainCube.position.clone(), mesh: mainCube },
      { position: cube2.position.clone(), mesh: cube2 },
      { position: cube3.position.clone(), mesh: cube3 }
    ];

    sceneRef.current = {
      scene,
      camera,
      renderer,
      controls,
      joints,
      targetBlocks,
      currentTarget: 0,
      phase: 'reaching',
      phaseTime: 0
    };

    // Smart animation loop - robot actively tries to grab blocks
    let animationId: number;
    let lastTime = Date.now();

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controls.update();

      const currentTime = Date.now();
      const deltaTime = (currentTime - lastTime) / 1000; // seconds
      lastTime = currentTime;

      if (sceneRef.current) {
        const { targetBlocks, joints, phase } = sceneRef.current;
        sceneRef.current.phaseTime += deltaTime;

        // Get current target block
        const target = targetBlocks[sceneRef.current.currentTarget];
        const targetPos = target.position;

        // Intelligent reaching behavior
        const t = sceneRef.current.phaseTime;

        switch (phase) {
          case 'reaching':
            // Reach toward the target block
            const reachProgress = Math.min(t / 2.0, 1.0); // 2 seconds to reach
            const angle = Math.atan2(targetPos.z, targetPos.x);

            joints[0].rotation.y = angle; // Base rotates toward target
            joints[1].rotation.z = 0.3 + Math.sin(reachProgress * Math.PI) * 0.5; // Shoulder extends
            joints[2].rotation.z = -0.8 + Math.sin(reachProgress * Math.PI) * 0.4; // Elbow bends
            joints[3].rotation.x = Math.sin(reachProgress * Math.PI * 2) * 0.2; // Wrist adjusts
            joints[4].rotation.z = 0.2;
            joints[5].rotation.x = Math.sin(reachProgress * Math.PI * 3) * 0.1;

            if (reachProgress >= 1.0) {
              sceneRef.current.phase = 'grasping';
              sceneRef.current.phaseTime = 0;
            }
            break;

          case 'grasping':
            // Close gripper and grab the block
            if (t > 0.5) { // Wait 0.5s then grab
              // Make target block glow to show it's being grabbed
              if (target.mesh.material instanceof THREE.MeshStandardMaterial) {
                target.mesh.material.emissiveIntensity = 0.3 + Math.sin(t * 10) * 0.1;
              }

              if (t > 1.5) {
                sceneRef.current.phase = 'lifting';
                sceneRef.current.phaseTime = 0;
              }
            }
            break;

          case 'lifting':
            // Lift the block up
            const liftProgress = Math.min(t / 1.5, 1.0);
            joints[1].rotation.z = 0.8 - liftProgress * 0.5; // Shoulder lifts
            joints[2].rotation.z = -0.4 + liftProgress * 0.3; // Elbow adjusts

            // Move block with end effector (simulated)
            target.mesh.position.y = target.position.y + liftProgress * 0.3;

            if (liftProgress >= 1.0) {
              sceneRef.current.phase = 'moving';
              sceneRef.current.phaseTime = 0;
            }
            break;

          case 'moving':
            // Move to placement location
            const moveProgress = Math.min(t / 2.0, 1.0);
            joints[0].rotation.y += deltaTime * 0.5; // Rotate base

            if (moveProgress >= 1.0) {
              sceneRef.current.phase = 'placing';
              sceneRef.current.phaseTime = 0;
            }
            break;

          case 'placing':
            // Place block down and reset
            const placeProgress = Math.min(t / 1.0, 1.0);
            target.mesh.position.y = target.position.y + 0.3 - (placeProgress * 0.3);

            if (placeProgress >= 1.0) {
              // Reset block emissive
              if (target.mesh.material instanceof THREE.MeshStandardMaterial) {
                target.mesh.material.emissiveIntensity = 0.1;
              }

              // Move to next target
              sceneRef.current.currentTarget = (sceneRef.current.currentTarget + 1) % targetBlocks.length;
              sceneRef.current.phase = 'reaching';
              sceneRef.current.phaseTime = 0;
            }
            break;
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !sceneRef.current) return;
      const { camera, renderer } = sceneRef.current;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      if (sceneRef.current) {
        sceneRef.current.renderer.dispose();
        if (containerRef.current?.contains(sceneRef.current.renderer.domElement)) {
          containerRef.current.removeChild(sceneRef.current.renderer.domElement);
        }
      }
    };
  }, []);

  // Update joint angles - THIS IS THE KEY PART
  useEffect(() => {
    if (!sceneRef.current?.joints || jointAngles.length < 6) return;

    const joints = sceneRef.current.joints;

    // Apply rotations to each joint in the kinematic chain
    // J0 - base rotation (Y axis)
    joints[0].rotation.y = jointAngles[0];

    // J1 - shoulder pitch (Z axis)
    joints[1].rotation.z = jointAngles[1];

    // J2 - elbow pitch (Z axis)
    joints[2].rotation.z = jointAngles[2];

    // J3 - wrist1 roll (X axis)
    joints[3].rotation.x = jointAngles[3];

    // J4 - wrist2 pitch (Z axis)
    joints[4].rotation.z = jointAngles[4];

    // J5 - wrist3 roll (X axis)
    joints[5].rotation.x = jointAngles[5];

  }, [jointAngles]);

  // Update gripper glow based on state
  useEffect(() => {
    if (!sceneRef.current?.joints) return;

    // Find gripper glow (last child of j5)
    const j5 = sceneRef.current.joints[5];
    j5.traverse((child) => {
      if (child instanceof THREE.Mesh &&
          'emissive' in child.material &&
          (child.material as THREE.MeshStandardMaterial).emissive?.getHex() === 0xffff00) {
        (child.material as THREE.MeshStandardMaterial).emissiveIntensity =
          gripperState === 'closed' ? 0.9 : 0.4;
      }
    });
  }, [gripperState]);

  return <div ref={containerRef} className="w-full h-full" />;
}
