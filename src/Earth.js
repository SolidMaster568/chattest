import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useTexture, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const TEX = process.env.PUBLIC_URL + '/textures';
const MODEL = process.env.PUBLIC_URL + '/models/satellite.glb';
// Load the DRACO decoder from our own /public folder, not the Google CDN,
// so the model still opens when there's no internet.
const DRACO = process.env.PUBLIC_URL + '/draco/gltf/';
const EARTH_RADIUS = 2;

// Deep-space backdrop rendered fully in a shader on a large inside-out sphere:
// a tilted Milky Way band with nebula clouds, dust lanes, a warm galactic core,
// and crisp multi-size stars. Looks like a real long-exposure sky, and it's all
// procedural, so there are no image files to load and it stays offline.
function SpaceBackground() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          varying vec3 vDir;

          float hash(vec3 p){
            p = fract(p * 0.3183099 + 0.1);
            p *= 17.0;
            return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
          }

          float noise(vec3 x){
            vec3 i = floor(x);
            vec3 f = fract(x);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(hash(i + vec3(0.0,0.0,0.0)), hash(i + vec3(1.0,0.0,0.0)), f.x),
                           mix(hash(i + vec3(0.0,1.0,0.0)), hash(i + vec3(1.0,1.0,0.0)), f.x), f.y),
                       mix(mix(hash(i + vec3(0.0,0.0,1.0)), hash(i + vec3(1.0,0.0,1.0)), f.x),
                           mix(hash(i + vec3(0.0,1.0,1.0)), hash(i + vec3(1.0,1.0,1.0)), f.x), f.y), f.z);
          }

          float fbm(vec3 p){
            float v = 0.0;
            float a = 0.5;
            for(int i = 0; i < 4; i++){
              v += a * noise(p);
              p *= 2.02;
              a *= 0.5;
            }
            return v;
          }

          // crisp point-stars: only some grid cells hold a star, with size/brightness variation
          float stars(vec3 dir, float scale, float thresh){
            vec3 p = dir * scale;
            vec3 id = floor(p);
            float h = hash(id);
            if(h < thresh) return 0.0;
            vec3 offs = vec3(hash(id + 1.3), hash(id + 2.7), hash(id + 4.1)) - 0.5;
            vec3 gv = fract(p) - 0.5 - offs * 0.7;
            float d = length(gv);
            float core = smoothstep(0.08, 0.0, d);
            float bright = (h - thresh) / (1.0 - thresh);
            return core * bright;
          }

          void main(){
            vec3 dir = normalize(vDir);

            // base gradient — very dark, a touch cooler toward "up"
            float t = dir.y * 0.5 + 0.5;
            vec3 col = mix(vec3(0.006, 0.008, 0.016), vec3(0.014, 0.019, 0.038), t);

            // Milky Way band around a tilted great circle
            vec3 axis = normalize(vec3(0.35, 1.0, 0.15));
            float band = exp(-7.0 * pow(dot(dir, axis), 2.0));

            // nebula clouds, concentrated in the band
            float clouds = pow(fbm(dir * 3.0 + 11.0), 2.0);
            vec3 nebA = vec3(0.10, 0.16, 0.30);   // cool blue
            vec3 nebB = vec3(0.22, 0.10, 0.26);   // dim magenta
            vec3 neb = mix(nebA, nebB, fbm(dir * 2.0));
            col += neb * clouds * band * 1.3;

            // warm galactic-core haze
            col += vec3(0.30, 0.22, 0.14) * pow(band, 2.5) * fbm(dir * 1.5) * 0.6;

            // dark dust lanes cutting across the band
            float dust = smoothstep(0.45, 0.8, fbm(dir * 6.0 + 4.0));
            col *= 1.0 - band * dust * 0.55;

            // milky haze of unresolved stars along the band
            col += vec3(0.05, 0.06, 0.08) * band * 0.5;

            // three star layers, a little denser near the band
            float s = 0.0;
            s += stars(dir, 220.0, 0.90);
            s += stars(dir, 480.0, 0.94) * 0.75;
            s += stars(dir, 900.0, 0.96) * 0.5 * (0.4 + band);

            // slight color per star (blue-white to warm)
            vec3 tint = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.9, 0.75), hash(floor(dir * 220.0)));
            col += s * tint;

            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    []
  );

  return (
    <mesh material={material} scale={400}>
      <sphereGeometry args={[1, 64, 64]} />
    </mesh>
  );
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

  const [dayMap, cloudMap, normalMap, specularMap] = useTexture([
    `${TEX}/2k_earth_daymap.jpg`,
    `${TEX}/2k_earth_clouds.jpg`,
    `${TEX}/earth_normal_2048.jpg`,
    `${TEX}/earth_specular_2048.jpg`,
  ]);

  // real photographic colors for the day map; the others stay linear data maps
  useMemo(() => {
    dayMap.colorSpace = THREE.SRGBColorSpace;
    dayMap.anisotropy = 8;
  }, [dayMap]);

  useFrame((_, delta) => {
    earth.current.rotation.y += 0.03 * delta;
    clouds.current.rotation.y += 0.042 * delta; // clouds drift a touch faster
  });

  return (
    <group rotation={[0.35, 0, 0]}>
      {/* earth surface: real colors, terrain relief, glossy oceans */}
      <mesh ref={earth}>
        <sphereGeometry args={[EARTH_RADIUS, 128, 128]} />
        <meshPhongMaterial
          map={dayMap}
          normalMap={normalMap}
          normalScale={new THREE.Vector2(0.8, 0.8)}
          specularMap={specularMap}
          specular={new THREE.Color('#38495a')}
          shininess={16}
        />
      </mesh>

      {/* drifting cloud layer */}
      <mesh ref={clouds} scale={1.012}>
        <sphereGeometry args={[EARTH_RADIUS, 96, 96]} />
        <meshPhongMaterial alphaMap={cloudMap} transparent opacity={0.5} depthWrite={false} />
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
  const { scene } = useGLTF(MODEL, DRACO);

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
      {/* even, sunlit lighting so the whole visible face reads like a blue marble */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[2, 1, 5]} intensity={1.9} color="#fff6e6" />

      <SpaceBackground />

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

useGLTF.preload(MODEL, DRACO);
