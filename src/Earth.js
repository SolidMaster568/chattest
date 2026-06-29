import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, useTexture, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const TEX = process.env.PUBLIC_URL + '/textures';
const MODEL = process.env.PUBLIC_URL + '/models/satellite.glb';
const EARTH_RADIUS = 2;

// Take the real day map and push the land toward lush green (oceans untouched).
function buildGreenLandTexture(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const isOcean = b > r + 8 && b > g; // blue-dominant pixels are sea
    if (!isOcean) {
      d[i] = r * 0.82;                       // pull down red
      d[i + 1] = Math.min(255, g * 1.5 + 18); // boost green
      d[i + 2] = b * 0.8;                     // pull down blue
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Soft blue rim-light around the planet (fresnel atmosphere shader).
function Atmosphere() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          varying vec3 vNormal;
          void main() {
            float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
            gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity;
          }`,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
      }),
    []
  );

  return (
    <mesh scale={1.16} material={material}>
      <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
    </mesh>
  );
}

function Globe() {
  const earth = useRef();
  const clouds = useRef();

  const [dayRaw, nightMap, cloudMap, normalMap, specularMap] = useTexture([
    `${TEX}/2k_earth_daymap.jpg`,
    `${TEX}/2k_earth_nightmap.jpg`,
    `${TEX}/2k_earth_clouds.jpg`,
    `${TEX}/earth_normal_2048.jpg`,
    `${TEX}/earth_specular_2048.jpg`,
  ]);

  // greener land, computed once from the loaded day image
  const dayMap = useMemo(() => buildGreenLandTexture(dayRaw.image), [dayRaw]);
  useMemo(() => {
    nightMap.colorSpace = THREE.SRGBColorSpace;
  }, [nightMap]);

  useFrame((_, delta) => {
    earth.current.rotation.y += 0.035 * delta;
    clouds.current.rotation.y += 0.05 * delta; // clouds drift a touch faster
  });

  return (
    <group rotation={[0.41, 0, 0]}>
      {/* earth surface: green land, glinting oceans, city lights at night */}
      <mesh ref={earth}>
        <sphereGeometry args={[EARTH_RADIUS, 96, 96]} />
        <meshPhongMaterial
          map={dayMap}
          normalMap={normalMap}
          specularMap={specularMap}
          specular={new THREE.Color('#2a3b4d')}
          shininess={14}
          emissiveMap={nightMap}
          emissive={new THREE.Color('#ffd28a')}
          emissiveIntensity={0.9}
        />
      </mesh>

      {/* drifting cloud layer */}
      <mesh ref={clouds} scale={1.012}>
        <sphereGeometry args={[EARTH_RADIUS, 96, 96]} />
        <meshPhongMaterial alphaMap={cloudMap} transparent opacity={0.4} depthWrite={false} />
      </mesh>

      <Atmosphere />
    </group>
  );
}

// One orbiting satellite using the real GLTF model.
function Satellite({ proto, radius, speed, tilt, phase }) {
  const pivot = useRef();
  const self = useRef();

  // clone + normalize the model's size/center once
  const model = useMemo(() => {
    const obj = proto.clone(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const scale = 0.6 / Math.max(size.x, size.y, size.z);
    obj.scale.setScalar(scale);
    obj.position.copy(center.multiplyScalar(-scale));
    return obj;
  }, [proto]);

  useFrame((_, delta) => {
    pivot.current.rotation.y += speed * delta;     // revolve around earth
    self.current.rotation.y += 0.3 * delta;        // gentle self-spin
  });

  return (
    <group rotation={[tilt, 0, 0]}>
      <group ref={pivot} rotation={[0, phase, 0]}>
        <group ref={self} position={[radius, 0, 0]}>
          <primitive object={model} />
        </group>
      </group>

      {/* faint orbit path */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius - 0.006, radius + 0.006, 128]} />
        <meshBasicMaterial color="#2b3a47" side={THREE.DoubleSide} transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

function Scene() {
  const { scene } = useGLTF(MODEL);

  return (
    <>
      <Globe />
      <Satellite proto={scene} radius={3.0} speed={0.5} tilt={0.25} phase={0} />
      <Satellite proto={scene} radius={3.6} speed={0.38} tilt={-0.5} phase={2.1} />
      <Satellite proto={scene} radius={4.3} speed={0.28} tilt={0.85} phase={4.0} />
    </>
  );
}

export default function Earth() {
  return (
    <Canvas
      camera={{ position: [0, 1.5, 6], fov: 45 }}
      gl={{ antialias: true }}
      style={{ width: '100vw', height: '100vh', background: '#03050a' }}
    >
      {/* low ambient + strong warm "sun" = realistic day/night terminator */}
      <ambientLight intensity={0.12} />
      <directionalLight position={[5, 2, 3]} intensity={2.2} color="#fff6e6" />

      <Stars radius={120} depth={60} count={6000} factor={4} saturation={0} fade speed={0.5} />

      <Suspense fallback={null}>
        <Scene />
      </Suspense>

      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.05}
        minDistance={3.2}
        maxDistance={14}
      />
    </Canvas>
  );
}

useGLTF.preload(MODEL);
