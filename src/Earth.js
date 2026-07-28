import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useTexture, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import round1 from './round_1.png';
import round2 from './round_2.png';
import round3 from './round_3.png';
import round4 from './round_4.png';
import round5 from './round_5.png';

const TEX = process.env.PUBLIC_URL + '/textures';
const MODEL = process.env.PUBLIC_URL + '/models/satellite.glb';
// Load the DRACO decoder from our own /public folder, not the Google CDN,
// so the model still opens when there's no internet.
const DRACO = process.env.PUBLIC_URL + '/draco/gltf/';
const EARTH_RADIUS = 2;
const BEAM_ANGLE = 0.26;   // half-angle of a satellite's downlink cone, radians
// Where the scene's light comes from.
const SUN = new THREE.Vector3(2, 1, 5).normalize();

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
            float off = dot(dir, axis);
            float band = exp(-7.0 * off * off);

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

// Where each badge goes when it's clicked — swap these for the real thing.
const ROUNDS = [
  { src: round1, href: 'https://react.dev' },
  { src: round2, href: 'https://threejs.org' },
  { src: round3, href: 'https://r3f.docs.pmnd.rs' },
  { src: round4, href: 'https://drei.docs.pmnd.rs' },
  { src: round5, href: 'https://create-react-app.dev' },
];
const ROUND_SRCS = ROUNDS.map((r) => r.src);

// An off-site link opens in its own tab, so a click doesn't throw away the
// running scene; anything else is read as a path in this app and goes in place.
function follow(href) {
  if (/^https?:\/\//i.test(href)) window.open(href, '_blank', 'noopener,noreferrer');
  else window.location.assign(href);
}

// three's raycaster doesn't consult `visible` — a faded-out badge would still
// take the cursor, so hovering bare space would pop the ring open and clicking
// there would navigate. Gate hit-testing on actually being on screen.
function whileShown(raycaster, hits) {
  if (this.visible) THREE.Mesh.prototype.raycast.call(this, raycaster, hits);
}

// A carousel of badges that circles the planet while the cursor is on it.
//
// It's parented straight to the scene rather than to anything that turns, and
// each badge's place on the circle is worked out per frame instead of coming
// from a rotating group. That's deliberate: with no rotation above them, facing
// a badge at the screen is just copying the camera's orientation, which keeps
// every one of them square-on and readable no matter where it is in the turn.
function ImageRing({ show, onHover, radius = 2.8, size = 0.6, speed = 0.35 }) {
  const badges = useRef([]);
  const fade = useRef(0);
  const under = useRef(-1);                          // badge the cursor is on, if any
  const lift = useRef(ROUNDS.map(() => 0));          // its eased response
  const pressed = useRef([0, 0]);
  const maps = useTexture(ROUND_SRCS);

  // logos are authored as sRGB artwork, not linear data
  useMemo(() => maps.forEach((m) => (m.colorSpace = THREE.SRGBColorSpace)), [maps]);

  // never leave the page holding a pointer cursor we set
  useEffect(() => () => { document.body.style.cursor = ''; }, []);

  useFrame((state, delta) => {
    // ease toward the target instead of cutting, so hovering on and off glides
    const k = Math.min(1, delta * 6);
    fade.current += ((show ? 1 : 0) - fade.current) * k;
    const lit = fade.current > 0.004;

    const t = state.clock.elapsedTime * speed;
    badges.current.forEach((badge, i) => {
      badge.visible = lit;
      if (!lit) return;

      const a = t + (i / ROUNDS.length) * Math.PI * 2;
      badge.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
      badge.quaternion.copy(state.camera.quaternion);

      // the one under the cursor swells and comes up to full strength, so it's
      // obvious which badge a click would land on
      lift.current[i] += ((under.current === i ? 1 : 0) - lift.current[i]) * k;
      badge.scale.setScalar(size * (0.82 + 0.18 * fade.current + 0.22 * lift.current[i]));
      badge.material.opacity = fade.current * (0.78 + 0.22 * lift.current[i]);
    });
  });

  const enter = (i) => (e) => {
    e.stopPropagation();                 // this badge owns the cursor, not the planet behind it
    under.current = i;
    document.body.style.cursor = 'pointer';
    onHover(true);
  };

  // guarded on identity: sliding straight from one badge to the next fires this
  // for the old one after the new one has already claimed the cursor
  const leave = (i) => () => {
    if (under.current === i) {
      under.current = -1;
      document.body.style.cursor = '';
    }
    onHover(false);
  };

  const click = (href) => (e) => {
    e.stopPropagation();
    // a drag that happens to finish on a badge is someone turning the globe,
    // not someone asking to leave the page
    if (Math.hypot(e.clientX - pressed.current[0], e.clientY - pressed.current[1]) > 4) return;
    follow(href);
  };

  return (
    <group>
      {maps.map((map, i) => (
        <mesh
          key={i}
          ref={(el) => (badges.current[i] = el)}
          visible={false}
          raycast={whileShown}
          onPointerOver={enter(i)}
          onPointerOut={leave(i)}
          onPointerDown={(e) => (pressed.current = [e.clientX, e.clientY])}
          onClick={click(ROUNDS[i].href)}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={map} transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function Globe({ onHover }) {
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
      <mesh
        ref={earth}
        onPointerOver={() => onHover(true)}
        onPointerOut={() => onHover(false)}
      >
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
    </group>
  );
}

// A satellite downlink: a faint cone of light from the dish with a single soft
// impulse sweeping down it, answered by a ripple spreading across the ground
// where it lands. Both read off one clock uniform, so the ripple always belongs
// to the impulse that just arrived. It all lives in the pivot's frame, where
// the planet is straight down -X, so the beam tracks the orbit for free.
function Downlink({ altitude, offset, period = 3.2 }) {
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uColor: { value: new THREE.Color('#5fc8ff') } }),
    []
  );

  // Sink the cone's base a little under the surface so the planet's own depth
  // clips it — the beam then ends on the curve instead of hovering above it.
  const floor = EARTH_RADIUS * 0.96;
  const drop = altitude - floor;
  const spread = drop * Math.tan(BEAM_ANGLE);              // beam radius at the ground
  const reach = Math.asin(Math.min(spread / EARTH_RADIUS, 0.55));   // ripple's angular size

  const beam = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        vertexShader: `
          varying vec2 vUv;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vUv = uv;
            vNormal = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform float uTime;
          uniform vec3 uColor;
          varying vec2 vUv;
          varying vec3 vNormal;
          varying vec3 vView;

          void main() {
            float h = vUv.y;   // 1 at the dish, 0 at the ground

            // grazing angles read brighter, the way a real shaft of light does
            float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 1.8);

            // the cone itself is only a suggestion — a haze that thins as it widens
            float haze = (0.04 + 0.16 * rim) * mix(0.3, 1.0, h);

            // the impulse: one soft band travelling from the dish to the surface
            float off = (h - (1.0 - uTime)) / 0.10;
            float band = exp(-off * off);

            float alpha = haze + band * (0.28 + 0.40 * rim);
            // no hard ends — ease off at the ground and at the degenerate apex
            alpha *= smoothstep(0.0, 0.12, h) * (1.0 - smoothstep(0.94, 1.0, h));

            gl_FragColor = vec4(mix(uColor, vec3(0.85, 0.95, 1.0), band * 0.6), alpha);
          }`,
      }),
    [uniforms]
  );

  const ripple = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform float uTime;
          uniform vec3 uColor;
          varying vec2 vUv;

          void main() {
            float d = 1.0 - vUv.y;   // 0 under the satellite, 1 at the cap's edge
            float off = (d - uTime) / 0.13;
            float ring = exp(-off * off);
            float alpha = ring * pow(1.0 - uTime, 1.5) * 0.5;
            alpha *= smoothstep(0.0, 0.08, uTime);          // swells in, never pops
            alpha *= 1.0 - smoothstep(0.8, 1.0, d);         // spent before the cap runs out
            gl_FragColor = vec4(uColor, alpha);
          }`,
      }),
    [uniforms]
  );

  // wraps to 0..1 here rather than in the shader, so the band stays crisp no
  // matter how long the page has been open
  useFrame((state) => {
    uniforms.uTime.value = (state.clock.elapsedTime / period + offset) % 1;
  });

  return (
    <>
      {/* the cone's apex sits at the dish; -90° about Z aims it down the nadir line */}
      <group position={[(altitude + floor) / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <mesh material={beam}>
          <coneGeometry args={[spread, drop, 64, 1, true]} />
        </mesh>
      </group>

      {/* the ripple is a spherical cap, so it hugs the curve instead of cutting through it */}
      <group rotation={[0, 0, -Math.PI / 2]}>
        <mesh material={ripple}>
          <sphereGeometry args={[EARTH_RADIUS * 1.02, 64, 24, 0, Math.PI * 2, 0, reach]} />
        </mesh>
      </group>
    </>
  );
}

// The other reading of a downlink: the transmission as expanding wavefronts.
// Each shell is one pulse leaving the dish — a cap of a sphere centred on the
// satellite, so it stays a true wavefront as it grows, holding the beam's
// angular width the whole way out. It doesn't need to be faded off at the end:
// once a shell outgrows the distance to the ground its middle is inside the
// planet, and the planet's own depth eats it, so the wave visibly washes over
// the surface and breaks up.
function Wavefront({ altitude, offset, count = 4, period = 3.2 }) {
  const shells = useRef([]);
  const reach = (altitude - EARTH_RADIUS) * 1.14;

  // one material per shell — each carries its own fade, so they can't share
  const materials = useMemo(
    () =>
      Array.from(
        { length: count },
        () =>
          new THREE.ShaderMaterial({
            uniforms: { uFade: { value: 0 }, uColor: { value: new THREE.Color('#5fc8ff') } },
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            vertexShader: `
              varying vec2 vUv;
              varying vec3 vNormal;
              varying vec3 vView;
              void main() {
                vUv = uv;
                vNormal = normalize(normalMatrix * normal);
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                vView = normalize(-mv.xyz);
                gl_Position = projectionMatrix * mv;
              }`,
            fragmentShader: `
              uniform float uFade;
              uniform vec3 uColor;
              varying vec2 vUv;
              varying vec3 vNormal;
              varying vec3 vView;

              void main() {
                float d = 1.0 - vUv.y;   // 0 on the beam axis, 1 at the shell's rim

                // energy tails off toward the edge of the cone, never a cut edge
                float body = 1.0 - smoothstep(0.45, 1.0, d);

                // grazing angles pile up more of the shell under the pixel, which
                // is what keeps it reading as a thin surface and not a filled dome
                float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 1.5);

                gl_FragColor = vec4(uColor, uFade * body * (0.28 + 0.85 * rim));
              }`,
          })
      ),
    [count]
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime / period + offset;
    materials.forEach((mat, i) => {
      const p = (t + i / count) % 1;              // 0 leaving the dish, 1 at full reach
      shells.current[i].scale.setScalar(0.04 + p * reach);
      mat.uniforms.uFade.value = Math.sin(Math.PI * p) * 0.6;   // swells, then spends itself
    });
  });

  return (
    // shells are centred on the dish; +90° about Z swings the cap's axis onto -X, at the planet
    <group position={[altitude, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
      {materials.map((mat, i) => (
        <mesh key={i} ref={(el) => (shells.current[i] = el)} material={mat}>
          <sphereGeometry args={[1, 48, 16, 0, Math.PI * 2, 0, BEAM_ANGLE * 1.5]} />
        </mesh>
      ))}
    </group>
  );
}

// One orbiting satellite using the real GLTF model.
function Satellite({ proto, radius, speed, tilt, phase, mode }) {
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

  // The orbit line brightens into a wake just behind the satellite, so the path
  // shows which way the thing is actually travelling instead of sitting there as
  // an inert hoop.
  const orbit = useMemo(() => {
    const uniforms = { uAngle: { value: -phase }, uColor: { value: new THREE.Color('#2b3a47') } };
    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vPos;
        void main() {
          vPos = position.xy;   // the ring is built flat in XY, before it's laid down
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float uAngle;
        uniform vec3 uColor;
        varying vec2 vPos;

        void main() {
          // distance travelled since this bit of the ring was last flown over
          float back = mod(atan(vPos.y, vPos.x) - uAngle, 6.2831853);
          float wake = exp(-back * 1.5);
          gl_FragColor = vec4(mix(uColor, vec3(0.62, 0.86, 1.0), wake), 0.14 + 0.62 * wake);
        }`,
    });
    return { material, uniforms };
  }, [phase]);

  useFrame((_, delta) => {
    pivot.current.rotation.y += speed * delta;     // revolve around earth
    self.current.rotation.y += 0.06 * delta;       // barely-there roll: it holds attitude

    // a +Y turn of the pivot walks the satellite the other way around the flat
    // ring, hence the sign flip
    orbit.uniforms.uAngle.value = -pivot.current.rotation.y;
  });

  return (
    <group rotation={[tilt, 0, 0]}>
      <group ref={pivot} rotation={[0, phase, 0]}>
        {/* The satellite rides on +X of the pivot, so the planet is straight
            down -X from here. The model's antenna/dish boom runs along its own
            -Y, and a -90° roll about Z lines that up with -X, so the dish stays
            aimed at earth all the way around the orbit. */}
        <group position={[radius, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          {/* spins about the model's Y — the same axis that points at earth,
              so the roll never swings the dish off target */}
          <group ref={self}>
            <primitive object={model} />
          </group>
        </group>

        {/* the dish's signal, staggered per satellite so they don't ping in unison */}
        {mode === 'wave' ? (
          <Wavefront altitude={radius} offset={phase / (Math.PI * 2)} />
        ) : (
          <Downlink altitude={radius} offset={phase / (Math.PI * 2)} />
        )}
      </group>

      {/* orbit path — hairline thin, with the wake trailing the satellite */}
      <mesh rotation={[Math.PI / 2, 0, 0]} material={orbit.material}>
        <ringGeometry args={[radius - 0.004, radius + 0.004, 256]} />
      </mesh>
    </group>
  );
}

function Scene({ mode }) {
  const { scene } = useGLTF(MODEL, DRACO);
  const [onEarth, setOnEarth] = useState(false);
  const [onBadge, setOnBadge] = useState(false);

  return (
    <>
      {/* A badge crossing in front of the planet takes the cursor off it, so the
          badges have to hold the ring open themselves — otherwise reaching for
          one dismisses the thing you were reaching for. */}
      <Globe onHover={setOnEarth} />
      <ImageRing show={onEarth || onBadge} onHover={setOnBadge} />
      <Satellite proto={scene} radius={3.0} speed={0.5} tilt={0.25} phase={0} mode={mode} />
      <Satellite proto={scene} radius={3.6} speed={0.38} tilt={-0.5} phase={2.1} mode={mode} />
      <Satellite proto={scene} radius={4.3} speed={0.28} tilt={0.85} phase={4.0} mode={mode} />
    </>
  );
}

const MODES = [
  { id: 'beam', label: 'Beam' },
  { id: 'wave', label: 'Wavefront' },
];

// A segmented control rather than one button that flips: both readings stay on
// screen, so which one you're looking at is never something you have to infer.
const SWITCH = {
  position: 'absolute',
  top: 24,
  left: 24,
  display: 'flex',
  gap: 4,
  padding: 4,
  borderRadius: 999,
  background: 'rgba(9, 14, 24, 0.72)',
  border: '1px solid rgba(120, 170, 220, 0.18)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
};

const SWITCH_ITEM = {
  border: 'none',
  borderRadius: 999,
  padding: '8px 18px',
  background: 'transparent',
  color: 'rgba(168, 192, 216, 0.85)',
  font: '500 11px/1 ui-sans-serif, system-ui, "Segoe UI", sans-serif',
  letterSpacing: '0.11em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  transition: 'color 160ms ease, background 160ms ease',
};

const SWITCH_ON = {
  background: 'rgba(95, 200, 255, 0.16)',
  color: '#eaf6ff',
  boxShadow: 'inset 0 0 0 1px rgba(95, 200, 255, 0.32)',
};

export default function Earth() {
  const [mode, setMode] = useState('beam');

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <Canvas
        camera={{ position: [0, 1.5, 6], fov: 45 }}
        // render at the display's own density (capped at 2x) — the orbit hairlines
        // and the satellite's panel edges are too fine to survive at 1x
        dpr={[1, 2]}
        gl={{ antialias: true }}
        style={{ width: '100%', height: '100%', background: '#03050a' }}
      >
        {/* even, sunlit lighting so the whole visible face reads like a blue marble */}
        <ambientLight intensity={0.5} />
        <directionalLight position={SUN.toArray()} intensity={1.9} color="#fff6e6" />

        <SpaceBackground />

        <Suspense fallback={null}>
          <Scene mode={mode} />
        </Suspense>

        <OrbitControls
          enablePan={false}
          enableDamping
          dampingFactor={0.05}
          minDistance={3.2}
          maxDistance={14}
        />
      </Canvas>

      <div style={SWITCH}>
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            aria-pressed={mode === m.id}
            style={mode === m.id ? { ...SWITCH_ITEM, ...SWITCH_ON } : SWITCH_ITEM}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

useGLTF.preload(MODEL, DRACO);
