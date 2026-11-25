export function disposeMaterial(material) {
  for (const key in material) {
    const value = material[key];
    if (value && value.isTexture) value.dispose();
  }
  material.dispose();
}

/** Frees GPU resources for an object tree (geometries, materials, textures, instancing). */
export function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const m = o.material;
    if (m) (Array.isArray(m) ? m : [m]).forEach(disposeMaterial);
    if (o.isInstancedMesh) o.dispose();
    if (o.isLight && o.shadow && o.shadow.map) o.shadow.map.dispose();
  });
}
