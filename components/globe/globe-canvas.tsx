'use client';

import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  LinearMipmapLinearFilter,
  BackSide,
  SRGBColorSpace,
  TOUCH,
  Vector3,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  GEO_ASSET_URL,
  identifyFeature,
  topologyToFeatures,
  type CountryFeature,
  type FeatureIdentity,
} from '@/lib/geo/features';
import {
  FrameMonitor,
  QUALITY,
  buildCountryIndex,
  isTap,
  lonLatToVector3,
  ringsToSegments,
  uvToLonLat,
  vector3ToLonLat,
  type CountryIndex,
  type QualityTier,
} from '@/lib/geo/globe-math';
import { drawGlobeTexture } from '@/lib/geo/texture';

/**
 * The 3D globe. Loaded only on the client via next/dynamic (ssr: false) and only mounted when
 * the stage is visible and WebGL is usable. Renders on demand (no continuous loop), so an idle
 * globe costs nothing; disposes its texture, geometries and controls on unmount.
 */

export interface GlobeApi {
  rotateBy(dLon: number, dLat: number): void;
  zoomBy(factor: number): void;
  /** Country (or uncoded area) under the centre of the view. */
  centerIdentity(): FeatureIdentity | null;
}

export interface GlobeCanvasProps {
  countries: { iso2: string; isoNumeric: string | null; articleCount: number }[];
  selectedIso2: string | null;
  quality: QualityTier;
  dpr: number;
  reducedMotion: boolean;
  apiRef: MutableRefObject<GlobeApi | null>;
  onReady(): void;
  onSelect(identity: FeatureIdentity): void;
  onHover(identity: FeatureIdentity | null, x: number, y: number): void;
  onContextLost(): void;
  onContextRestored(): void;
  onSlowFrames(): void;
  onCenterChange?(identity: FeatureIdentity | null): void;
}

const MIN_DISTANCE = 1.35;
const MAX_DISTANCE = 8;
const START_DISTANCE = 3.6;
const FOV = 35;

/** Camera distance at which the whole sphere fits the narrower field of view, with a margin. */
export function fitDistance(aspect: number, fovDeg = FOV, margin = 1.5): number {
  const v = (fovDeg * Math.PI) / 180;
  const h = 2 * Math.atan(Math.tan(v / 2) * aspect);
  return margin / Math.sin(Math.min(v, h) / 2);
}

let topologyPromise: Promise<CountryFeature[]> | undefined;
function loadFeatures(): Promise<CountryFeature[]> {
  topologyPromise ??= fetch(GEO_ASSET_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`geo asset ${r.status}`);
      return r.json();
    })
    .then((t) => topologyToFeatures(t).filter((f) => f.properties?.name !== 'Antarctica'));
  topologyPromise.catch(() => {
    topologyPromise = undefined;
  });
  return topologyPromise;
}

export default function GlobeCanvas(props: GlobeCanvasProps) {
  const [features, setFeatures] = useState<CountryFeature[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    loadFeatures()
      .then((f) => alive && setFeatures(f))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);
  const numericToIso2 = useMemo(
    () => new Map(props.countries.filter((c) => c.isoNumeric).map((c) => [c.isoNumeric!, c.iso2])),
    [props.countries],
  );
  const index = useMemo(
    () => (features ? buildCountryIndex(features, numericToIso2) : null),
    [features, numericToIso2],
  );
  if (failed) throw new Error('Could not load country boundaries');
  if (!features || !index) return null;

  const q = QUALITY[props.quality];
  const initial = props.selectedIso2 ? index.centroid(props.selectedIso2) : null;
  const [lon, lat] = initial ?? [20, 12];
  return (
    <Canvas
      frameloop="demand"
      dpr={props.dpr}
      camera={{
        fov: FOV,
        near: 0.05,
        far: 50,
        position: lonLatToVector3(lon, lat, START_DISTANCE),
      }}
      gl={{
        antialias: q.antialias,
        alpha: true,
        powerPreference: 'default',
        failIfMajorPerformanceCaveat: false,
      }}
      onCreated={({ gl }) => {
        const el = gl.domElement;
        el.addEventListener('webglcontextlost', (e) => {
          e.preventDefault(); // allow the browser to restore the context
          props.onContextLost();
        });
        el.addEventListener('webglcontextrestored', () => props.onContextRestored());
        el.dataset.testid = 'globe-canvas';
      }}
      style={{ touchAction: 'none' }}
    >
      <Scene {...props} features={features} index={index} numericToIso2={numericToIso2} />
    </Canvas>
  );
}

function outlineGeometry(index: CountryIndex, iso2: string | null): BufferGeometry | null {
  const f = iso2 ? index.feature(iso2) : null;
  if (!f) return null;
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(ringsToSegments(f, 1.004), 3));
  return g;
}

function Scene({
  features,
  index,
  numericToIso2,
  countries,
  selectedIso2,
  quality,
  reducedMotion,
  apiRef,
  onReady,
  onSelect,
  onHover,
  onSlowFrames,
  onCenterChange,
}: GlobeCanvasProps & {
  features: CountryFeature[];
  index: CountryIndex;
  numericToIso2: Map<string, string>;
}) {
  const { camera, gl, invalidate, size } = useThree();
  const fit = fitDistance(size.width / Math.max(1, size.height));
  const fitted = useRef(false);
  // Frame the whole globe on first layout (and keep zoom-out bounded to a sensible range).
  useEffect(() => {
    if (fitted.current || size.width === 0) return;
    fitted.current = true;
    camera.position.setLength(Math.min(fit, MAX_DISTANCE));
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, fit, invalidate, size.width]);
  const controlsRef = useRef<OrbitControls | null>(null);
  const flight = useRef<{ from: Vector3; to: Vector3; start: number; ms: number } | null>(null);
  const pointer = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const activePointers = useRef(new Set<number>());
  const monitor = useRef(new FrameMonitor());
  const readySent = useRef(false);
  const q = QUALITY[quality];

  // Texture: drawn from vectors, rebuilt only when the quality tier or coverage changes.
  const hasNews = useMemo(
    () => new Set(countries.filter((c) => c.articleCount > 0).map((c) => c.iso2)),
    [countries],
  );
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = q.textureWidth;
    canvas.height = q.textureWidth / 2;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      drawGlobeTexture(
        ctx,
        q.textureWidth,
        features.map((f) => ({ feature: f, identity: identifyFeature(f, numericToIso2) })),
        hasNews,
      );
    }
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.minFilter = LinearMipmapLinearFilter;
    t.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
    return t;
  }, [features, numericToIso2, hasNews, q.textureWidth, gl]);
  useEffect(() => () => texture.dispose(), [texture]);

  const selectedGeom = useMemo(() => outlineGeometry(index, selectedIso2), [selectedIso2, index]);
  const [hoverIso, setHoverIso] = useState<string | null>(null);
  const hoverGeom = useMemo(
    () => (hoverIso && hoverIso !== selectedIso2 ? outlineGeometry(index, hoverIso) : null),
    [hoverIso, selectedIso2, index],
  );
  useEffect(() => () => selectedGeom?.dispose(), [selectedGeom]);
  useEffect(() => () => hoverGeom?.dispose(), [hoverGeom]);

  // Orbit controls: rotate + bounded zoom, no pan. One finger rotates, two fingers pinch-zoom.
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enablePan = false;
    controls.enableDamping = !reducedMotion;
    controls.dampingFactor = 0.12;
    controls.minDistance = MIN_DISTANCE;
    controls.maxDistance = Math.min(MAX_DISTANCE, fit * 1.35);
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.8;
    controls.minPolarAngle = 0.15;
    controls.maxPolarAngle = Math.PI - 0.15;
    controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }; // pan disabled => pinch zoom
    const onChange = () => {
      // Slower rotation when zoomed in keeps the country under the finger.
      controls.rotateSpeed =
        0.25 + 0.35 * ((camera.position.length() - MIN_DISTANCE) / (MAX_DISTANCE - MIN_DISTANCE));
      invalidate();
    };
    controls.addEventListener('change', onChange);
    controlsRef.current = controls;
    invalidate();
    return () => {
      controls.removeEventListener('change', onChange);
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl, invalidate, reducedMotion, fit]);

  // Keyboard / programmatic API used by the accessible wrapper.
  useEffect(() => {
    const centerIdentity = () => {
      const [lon, lat] = vector3ToLonLat([camera.position.x, camera.position.y, camera.position.z]);
      return index.lookup(lon, lat);
    };
    apiRef.current = {
      centerIdentity,
      rotateBy(dLon, dLat) {
        const dist = camera.position.length();
        const [lon, lat] = vector3ToLonLat([
          camera.position.x,
          camera.position.y,
          camera.position.z,
        ]);
        const next = lonLatToVector3(lon + dLon, Math.max(-75, Math.min(75, lat + dLat)), dist);
        camera.position.set(...next);
        camera.lookAt(0, 0, 0);
        controlsRef.current?.update();
        invalidate();
        onCenterChange?.(centerIdentity());
      },
      zoomBy(factor) {
        const dist = Math.max(
          MIN_DISTANCE,
          Math.min(MAX_DISTANCE, camera.position.length() * factor),
        );
        camera.position.setLength(dist);
        controlsRef.current?.update();
        invalidate();
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, camera, index, invalidate, onCenterChange]);

  // Fly to the selected country (instant with reduced motion).
  const lastSelected = useRef<string | null>(selectedIso2);
  useEffect(() => {
    if (!selectedIso2 || selectedIso2 === lastSelected.current) {
      lastSelected.current = selectedIso2;
      return;
    }
    lastSelected.current = selectedIso2;
    const c = index.centroid(selectedIso2);
    if (!c) return;
    const dist = camera.position.length();
    const to = new Vector3(...lonLatToVector3(c[0], c[1], dist));
    if (reducedMotion) {
      camera.position.copy(to);
      camera.lookAt(0, 0, 0);
      controlsRef.current?.update();
      invalidate();
      return;
    }
    flight.current = { from: camera.position.clone(), to, start: performance.now(), ms: 650 };
    invalidate();
  }, [selectedIso2, index, camera, reducedMotion, invalidate]);

  useFrame((_, delta) => {
    if (!readySent.current) {
      readySent.current = true;
      onReady();
    }
    const f = flight.current;
    if (f) {
      const t = Math.min(1, (performance.now() - f.start) / f.ms);
      const e = 1 - Math.pow(1 - t, 3);
      const dist = f.from.length();
      camera.position
        .copy(f.from)
        .normalize()
        .lerp(f.to.clone().normalize(), e)
        .normalize()
        .multiplyScalar(dist);
      camera.lookAt(0, 0, 0);
      if (t >= 1) flight.current = null;
      invalidate();
    }
    controlsRef.current?.update();
    if (monitor.current.push(delta * 1000)) {
      monitor.current.reset();
      onSlowFrames();
    }
  });

  const pick = (e: ThreeEvent<PointerEvent>): FeatureIdentity | null => {
    if (!e.uv) return null;
    const [lon, lat] = uvToLonLat(e.uv.x, e.uv.y);
    return index.lookup(lon, lat);
  };

  const lastHover = useRef(0);
  return (
    <>
      <mesh
        onPointerDown={(e) => {
          activePointers.current.add(e.pointerId);
          pointer.current = {
            x: e.nativeEvent.clientX,
            y: e.nativeEvent.clientY,
            t: performance.now(),
            id: e.pointerId,
          };
        }}
        onPointerUp={(e) => {
          const multi = activePointers.current.size > 1;
          activePointers.current.delete(e.pointerId);
          const down = pointer.current;
          pointer.current = null;
          if (multi || !down || down.id !== e.pointerId) return;
          if (
            !isTap(down, {
              x: e.nativeEvent.clientX,
              y: e.nativeEvent.clientY,
              t: performance.now(),
            })
          )
            return;
          const hit = pick(e);
          if (hit) onSelect(hit);
        }}
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse') return;
          const now = performance.now();
          if (now - lastHover.current < 60) return; // throttle picking
          lastHover.current = now;
          const hit = pick(e);
          setHoverIso(hit?.iso2 ?? null);
          onHover(hit, e.nativeEvent.clientX, e.nativeEvent.clientY);
          invalidate();
        }}
        onPointerOut={() => {
          setHoverIso(null);
          onHover(null, 0, 0);
          invalidate();
        }}
      >
        <sphereGeometry args={[1, q.sphereSegments, q.sphereSegments / 2]} />
        <meshBasicMaterial map={texture} />
      </mesh>
      {/* Thin rim so the sphere's edge reads against the black page (no glow, no animation). */}
      <mesh scale={1.015}>
        <sphereGeometry args={[1, q.sphereSegments, q.sphereSegments / 2]} />
        <meshBasicMaterial color="#1b2a42" side={BackSide} />
      </mesh>
      {hoverGeom ? (
        <lineSegments geometry={hoverGeom}>
          <lineBasicMaterial color="#a6b2c3" transparent opacity={0.9} />
        </lineSegments>
      ) : null}
      {selectedGeom ? (
        <lineSegments geometry={selectedGeom}>
          <lineBasicMaterial color="#65beff" />
        </lineSegments>
      ) : null}
    </>
  );
}
