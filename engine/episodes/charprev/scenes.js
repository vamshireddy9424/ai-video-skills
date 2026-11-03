import { THREE, shoot } from "/web/engine.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
export const captions = false;
const loader = new GLTFLoader();
async function fit(path, h) { const s = (await loader.loadAsync(path)).scene; const b = new THREE.Box3().setFromObject(s), z = b.getSize(new THREE.Vector3()); const g = new THREE.Group(); const i = new THREE.Group(); i.add(s); s.position.sub(b.getCenter(new THREE.Vector3())).add(new THREE.Vector3(0, z.y / 2, 0)); i.scale.setScalar(h / z.y); g.add(i); return g; }
export const scenes = { lineup: { async build(stage) {
  const g = new THREE.Group();
  const p = await fit("/assets/wd-people/model.glb", 1.6); p.position.set(0, 2.2, 0); g.add(p);
  const c = await fit("/assets/wd-couple/model.glb", 1.8); c.position.set(0, -0.4, 0); g.add(c);
  return { group: g, update() { stage.scene.background = new THREE.Color(0xffffff); stage.ground.visible = false; stage.bloom(null); shoot(stage, [0, 1.6, 7.5], [0, 1.6, 0]); } };
} } };
