import * as THREE from 'three';

export const createLabel = (text: string, position: THREE.Vector3): THREE.Sprite => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'bold 20px Arial';
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, 38);
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.position.copy(position);
  sprite.scale.set(35, 12, 1);
  sprite.center.set(0.5, 0);
  return sprite;
};

export const getVertebraInfo = (fileName: string) => {
  const match = fileName.match(/(C|T|L|S)(\d+)/i);
  if (!match) return { type: 'X', number: 0, fullName: 'X0' };
  return {
    type: match[1].toUpperCase(),
    number: parseInt(match[2]),
    fullName: match[0].toUpperCase(),
  };
};

export const createMeshMaterial = (
  color: number,
  isLeft: boolean = false,
  brightnessEnabled: boolean = false,
  brightness: number = 1.0
): THREE.MeshPhongMaterial => {
  // No emissive to avoid shadow/glow effects
  return new THREE.MeshPhongMaterial({
    color: isLeft ? 0xffffff : color,
    specular: 0x111111,
    shininess: 10,
    side: THREE.DoubleSide
  });
};

export const centerCameraOnObject = (
  camera: THREE.PerspectiveCamera,
  controls: any,
  object: THREE.Object3D
) => {
  const bbox = new THREE.Box3().setFromObject(object);
  const center = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  camera.position.set(center.x, center.y, maxDim * 2.5);
  camera.lookAt(center);

  if (controls) {
    controls.target.copy(center);
    controls.update();
  }
};
