import * as THREE from 'three';

/**
 * Generate a Three.js mesh from a 2D polygon drawn on a DICOM slice.
 *
 * worldPoints  — LPS world coordinates of the polygon vertices
 * normal       — unit normal of the slice plane (extrusion direction)
 * thickness    — extrusion depth in mm
 * color        — hex color string
 * id           — unique implant id stored in mesh.userData
 */
export function generateImplantMesh(
  worldPoints: Array<[number, number, number]>,
  normal: [number, number, number],
  thickness: number,
  color: string,
  id: string
): THREE.Mesh {
  // ── Build orthonormal plane basis ────────────────────────────────────────
  const N = new THREE.Vector3(...normal).normalize();
  const arbitrary = Math.abs(N.x) < 0.9
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0);
  const U = new THREE.Vector3().crossVectors(N, arbitrary).normalize();
  const V = new THREE.Vector3().crossVectors(N, U).normalize();

  // ── Centroid ─────────────────────────────────────────────────────────────
  const centroid = new THREE.Vector3();
  worldPoints.forEach(p => centroid.add(new THREE.Vector3(...p)));
  centroid.divideScalar(worldPoints.length);

  // ── Project polygon onto local UV plane ──────────────────────────────────
  const local2D = worldPoints.map(p => {
    const rel = new THREE.Vector3(...p).sub(centroid);
    return new THREE.Vector2(rel.dot(U), rel.dot(V));
  });

  // ── Build THREE.Shape ────────────────────────────────────────────────────
  const shape = new THREE.Shape();
  shape.moveTo(local2D[0].x, local2D[0].y);
  for (let i = 1; i < local2D.length; i++) shape.lineTo(local2D[i].x, local2D[i].y);
  shape.closePath();

  // ── Extrude ──────────────────────────────────────────────────────────────
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
  });
  geometry.computeVertexNormals();

  // ── Transform from local UV space → world LPS space ──────────────────────
  // basis: local X = U, local Y = V, local Z = N (extrusion direction)
  // offset centroid by -N * thickness/2 so the slab is centred on the slice
  const basis = new THREE.Matrix4().makeBasis(U, V, N);
  const offset = centroid.clone().sub(N.clone().multiplyScalar(thickness / 2));
  basis.setPosition(offset);
  geometry.applyMatrix4(basis);

  // ── Material ─────────────────────────────────────────────────────────────
  const material = new THREE.MeshPhongMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    shininess: 25,
    specular: new THREE.Color(0x333333),
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData = { implantId: id, isDrawnImplant: true };
  return mesh;
}
