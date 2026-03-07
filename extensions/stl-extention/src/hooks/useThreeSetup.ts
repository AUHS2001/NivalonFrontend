import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

interface UseThreeSetupReturn {
  rendererRef: React.MutableRefObject<THREE.WebGLRenderer | undefined>;
  controlsRef: React.MutableRefObject<OrbitControls | undefined>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | undefined>;
}

export const useThreeSetup = (
  mountRef: React.RefObject<HTMLDivElement>,
  sceneRef: React.MutableRefObject<THREE.Scene>,
  groupRef: React.MutableRefObject<THREE.Group>
): UseThreeSetupReturn => {
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const controlsRef = useRef<OrbitControls>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = sceneRef.current;
    const mount = mountRef.current;
    scene.background = new THREE.Color(0x000000);

    // Set up lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
    keyLight.position.set(1, 1, 1).normalize();
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-1, 0.5, -0.5).normalize();
    scene.add(fillLight);
    const backLight = new THREE.DirectionalLight(0xffffff, 0.25);
    backLight.position.set(0, 0, -1).normalize();
    scene.add(backLight);
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
    scene.add(hemisphereLight);

    // Add the group to the scene
    scene.add(groupRef.current);

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    // Create camera
    const camera = new THREE.PerspectiveCamera(
      45,
      mount.clientWidth / mount.clientHeight,
      0.1,
      10000
    );
    camera.position.set(0, 0, 350);
    cameraRef.current = camera;

    // Set up controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.maxDistance = 5000;
    controls.enableRotate = true;
    controls.rotateSpeed = 1.0;
    controls.enableZoom = true;
    controls.zoomSpeed = 1.2;
    controls.enablePan = true;
    controls.panSpeed = 0.8;


    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,      // Left click: rotate
      MIDDLE: THREE.MOUSE.DOLLY,     // Middle click: zoom
      RIGHT: THREE.MOUSE.PAN         // Right click: pan
    };

    controlsRef.current = controls;

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (mountRef.current && camera) {
        const width = mountRef.current.clientWidth;
        const height = mountRef.current.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        renderer.render(scene, camera);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [mountRef, sceneRef, groupRef]);

  return { rendererRef, controlsRef, cameraRef };
};
