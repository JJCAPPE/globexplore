'use client'

import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { Line, OrbitControls, Stars } from '@react-three/drei'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowRightLeft,
  Focus,
  Globe2,
  Info,
  Maximize2,
  Move3D,
  Orbit,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import {
  computePhysics,
  EARTH,
  formatDistance,
  formatMass,
  formatTime,
  latLonToUnit,
} from '@/lib/physics'
import type { Load, Vec3 } from '@/lib/physics'

type Mode = 'add' | 'move'
type LensMode = 'auto' | '1x' | '1e9' | '1e12'
type LensView = '3d' | '2d' | null
type PoleScaleMode = 'auto' | 'manual'

type Scenario = {
  id: string
  name: string
  kicker: string
  massKg: number
  lat: number
  lon: number
  source?: { lat: number; lon: number }
  destination?: { lat: number; lon: number }
  note: string
  badge: string
}

const MAX_DISPLAY_TILT = THREE.MathUtils.degToRad(24)
const AUTO_DISPLAY_TILT = THREE.MathUtils.degToRad(11)
const MAX_POLE_EXPONENT = 15

const SCENARIOS: Scenario[] = [
  {
    id: 'asia',
    name: 'Asia as a point mass',
    kicker: 'Thought experiment',
    massKg: 2.81e11,
    lat: 45,
    lon: 95,
    note: 'All people in Asia compressed to one point at 45° N to maximize the first-order figure-axis response. The mass is not actually added to Earth.',
    badge: 'Rigid model',
  },
  {
    id: 'three-gorges',
    name: 'Three Gorges reservoir',
    kicker: 'Water redistribution',
    massKg: 4.0e13,
    lat: 30.82,
    lon: 111.0,
    source: { lat: 18, lon: 95 },
    destination: { lat: 30.82, lon: 111 },
    note: 'A simplified 40 Gt surface transfer toward the Three Gorges region. Real reservoir loading is distributed and coupled to the solid Earth.',
    badge: 'Simplified transfer',
  },
  {
    id: 'greenland',
    name: 'Greenland ice shift',
    kicker: 'Climate-scale mass transfer',
    massKg: 2.5e14,
    lat: 72,
    lon: -40,
    source: { lat: 72, lon: -40 },
    destination: { lat: 25, lon: -25 },
    note: 'A scale experiment moving 250 Gt from Greenland toward lower latitude. It illustrates geometry, not a complete ocean-loading solution.',
    badge: 'Simplified transfer',
  },
  {
    id: 'tohoku',
    name: '2011 Tōhoku benchmark',
    kicker: 'Published geophysical event',
    massKg: 1e15,
    lat: 38.3,
    lon: 142.4,
    note: 'Earthquakes deform the full 3D Earth. This surface load is only a spatial scale experiment and must not be read as a reconstruction of the 2011 event.',
    badge: 'Published benchmark context',
  },
]

function transferArc(loads: Load[]) {
  const from = loads.find((load) => load.sign === -1)
  const to = loads.find((load) => load.sign === 1)
  if (!from || !to) return null

  const a = new THREE.Vector3(...latLonToUnit(from.lat, from.lon)).normalize()
  const b = new THREE.Vector3(...latLonToUnit(to.lat, to.lon)).normalize()
  const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1)
  const angle = Math.acos(dot)
  if (angle < 1e-6) return null

  const sin = Math.sin(angle)
  return Array.from({ length: 65 }, (_, index) => {
    const t = index / 64
    const point = a
      .clone()
      .multiplyScalar(Math.sin((1 - t) * angle) / sin)
      .add(b.clone().multiplyScalar(Math.sin(t * angle) / sin))
      .normalize()
    const lift = 1.035 + Math.sin(Math.PI * t) * 0.09
    return point.multiplyScalar(lift)
  })
}

function axisTilt(axis: Vec3) {
  return Math.atan2(Math.hypot(axis[0], axis[2]), axis[1])
}

function exaggerateAxis(axis: Vec3, multiplier: number) {
  const physicalTilt = axisTilt(axis)
  const lateral = Math.hypot(axis[0], axis[2])
  if (lateral < 1e-30 || physicalTilt === 0) return new THREE.Vector3(0, 1, 0)

  const displayTilt = Math.min(physicalTilt * multiplier, MAX_DISPLAY_TILT)
  const sin = Math.sin(displayTilt)
  return new THREE.Vector3(
    (axis[0] / lateral) * sin,
    Math.cos(displayTilt),
    (axis[2] / lateral) * sin,
  ).normalize()
}

function surfaceArc(axis: THREE.Vector3, radius = 1.026) {
  const north = new THREE.Vector3(0, 1, 0)
  const end = axis.clone().normalize()
  const angle = Math.acos(THREE.MathUtils.clamp(north.dot(end), -1, 1))
  if (angle < THREE.MathUtils.degToRad(0.035)) return null

  const sin = Math.sin(angle)
  return Array.from({ length: 49 }, (_, index) => {
    const t = index / 48
    return north
      .clone()
      .multiplyScalar(Math.sin((1 - t) * angle) / sin)
      .add(end.clone().multiplyScalar(Math.sin(t * angle) / sin))
      .normalize()
      .multiplyScalar(radius)
  })
}

function poleRing(colatitudeDeg: number) {
  const angle = THREE.MathUtils.degToRad(colatitudeDeg)
  const y = Math.cos(angle) * 1.018
  const radius = Math.sin(angle) * 1.018
  return Array.from({ length: 97 }, (_, index) => {
    const phase = (index / 96) * Math.PI * 2
    return new THREE.Vector3(Math.cos(phase) * radius, y, Math.sin(phase) * radius)
  })
}

function formatScaleFactor(value: number) {
  if (value < 1_000) return `${value.toFixed(value < 10 ? 2 : 0)}×`
  return `${value.toExponential(2).replace('e+', 'e')}×`
}

function formatDisplayAngle(radians: number) {
  const degrees = THREE.MathUtils.radToDeg(radians)
  if (degrees < 0.001) return `${(degrees * 3600).toFixed(3)}″`
  if (degrees < 0.1) return `${degrees.toFixed(3)}°`
  return `${degrees.toFixed(2)}°`
}

function CameraRig({
  focus,
  reducedMotion,
  controls,
}: {
  focus: boolean
  reducedMotion: boolean
  controls: { current: OrbitControlsImpl | null }
}) {
  const { camera } = useThree()
  const startPosition = useRef(new THREE.Vector3())
  const endPosition = useRef(new THREE.Vector3())
  const startTarget = useRef(new THREE.Vector3())
  const endTarget = useRef(new THREE.Vector3())
  const progress = useRef(1)

  useEffect(() => {
    startPosition.current.copy(camera.position)
    endPosition.current.set(focus ? 0.32 : 0.2, focus ? 2.08 : 0.35, focus ? 1.72 : 3.05)
    startTarget.current.copy(controls.current?.target ?? new THREE.Vector3())
    endTarget.current.set(0, focus ? 0.72 : 0, 0)
    progress.current = reducedMotion ? 1 : 0

    if (reducedMotion) {
      camera.position.copy(endPosition.current)
      controls.current?.target.copy(endTarget.current)
      controls.current?.update()
    }
  }, [camera, controls, focus, reducedMotion])

  useFrame((_, delta) => {
    if (progress.current >= 1) return
    progress.current = Math.min(1, progress.current + delta / 0.82)
    const eased = 1 - (1 - progress.current) ** 3
    camera.position.lerpVectors(startPosition.current, endPosition.current, eased)
    controls.current?.target.lerpVectors(startTarget.current, endTarget.current, eased)
    controls.current?.update()
  })

  return null
}

function RotatingEarth({
  loads,
  onPick,
  figureAxis,
  spinAxis,
  visualMultiplier,
  poleLens,
  poleFocus,
  reducedMotion,
}: {
  loads: Load[]
  onPick: (lat: number, lon: number) => void
  figureAxis: Vec3
  spinAxis: Vec3
  visualMultiplier: number
  poleLens: boolean
  poleFocus: boolean
  reducedMotion: boolean
}) {
  const group = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (group.current && !reducedMotion && !poleLens && !poleFocus) {
      group.current.rotation.y += delta * 0.012
    }
  })

  const rawFigure = useMemo(
    () => new THREE.Vector3(...figureAxis).normalize(),
    [figureAxis],
  )
  const displayFigure = useMemo(
    () => exaggerateAxis(figureAxis, poleLens ? visualMultiplier : 1),
    [figureAxis, poleLens, visualMultiplier],
  )
  const displaySpin = useMemo(
    () => exaggerateAxis(spinAxis, poleLens ? visualMultiplier : 1),
    [poleLens, spinAxis, visualMultiplier],
  )
  const transfer = useMemo(() => transferArc(loads), [loads])
  const figureArc = useMemo(() => surfaceArc(displayFigure), [displayFigure])
  const spinArc = useMemo(() => surfaceArc(displaySpin, 1.032), [displaySpin])
  const guideRings = useMemo(() => [5, 10, 15, 20].map(poleRing), [])

  const geographicEnd = new THREE.Vector3(0, 1.72, 0)
  const rawFigureEnd = rawFigure.clone().multiplyScalar(1.725)
  const figureEnd = displayFigure.clone().multiplyScalar(1.73)
  const spinEnd = displaySpin.clone().multiplyScalar(1.705)
  const figurePole = displayFigure.clone().multiplyScalar(1.045)
  const spinPole = displaySpin.clone().multiplyScalar(1.052)

  return (
    <group ref={group}>
      <mesh
        onPointerDown={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          const local = event.point.clone()
          if (group.current) group.current.worldToLocal(local)
          const point = local.normalize()
          const lat = (Math.asin(point.y) * 180) / Math.PI
          const lon = (Math.atan2(point.z, point.x) * 180) / Math.PI
          onPick(lat, lon)
        }}
      >
        <sphereGeometry args={[1, 96, 96]} />
        <meshStandardMaterial color="#09151c" roughness={0.68} metalness={0.08} />
      </mesh>

      <mesh scale={1.018}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial
          color="#5cdcff"
          side={THREE.BackSide}
          transparent
          opacity={0.055}
          depthWrite={false}
        />
      </mesh>
      <mesh scale={1.004}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshBasicMaterial color="#59d6ff" wireframe transparent opacity={0.045} />
      </mesh>

      {[-60, -30, 0, 30, 60].map((lat) => {
        const radius = Math.cos((lat * Math.PI) / 180)
        const y = Math.sin((lat * Math.PI) / 180)
        const points = Array.from({ length: 97 }, (_, index) =>
          new THREE.Vector3(
            Math.cos((index / 96) * Math.PI * 2) * radius,
            y,
            Math.sin((index / 96) * Math.PI * 2) * radius,
          ),
        )
        return (
          <Line
            key={`lat-${lat}`}
            points={points}
            color="#89a7b7"
            transparent
            opacity={lat === 0 ? 0.3 : 0.075}
            lineWidth={lat === 0 ? 1 : 0.45}
          />
        )
      })}

      {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lon) => {
        const longitude = (lon * Math.PI) / 180
        const points = Array.from({ length: 65 }, (_, index) => {
          const latitude = -Math.PI / 2 + (index / 64) * Math.PI
          return new THREE.Vector3(
            Math.cos(latitude) * Math.cos(longitude),
            Math.sin(latitude),
            Math.cos(latitude) * Math.sin(longitude),
          )
        })
        return (
          <Line
            key={`lon-${lon}`}
            points={points}
            color="#89a7b7"
            transparent
            opacity={0.055}
            lineWidth={0.45}
          />
        )
      })}

      {poleLens &&
        guideRings.map((points, index) => (
          <Line
            key={`pole-guide-${index}`}
            points={points}
            color="#62dcff"
            transparent
            opacity={0.07 + index * 0.012}
            lineWidth={0.55}
          />
        ))}

      {transfer && <Line points={transfer} color="#f3f7f8" transparent opacity={0.55} lineWidth={1.2} />}

      {loads.map((load, index) => {
        const unit = latLonToUnit(load.lat, load.lon)
        return (
          <group
            key={`${index}-${load.lat}-${load.lon}`}
            position={[unit[0] * 1.035, unit[1] * 1.035, unit[2] * 1.035]}
          >
            <mesh>
              <sphereGeometry args={[0.026, 20, 20]} />
              <meshBasicMaterial color={load.sign === -1 ? '#ff7d71' : '#f3f7f8'} />
            </mesh>
            <mesh scale={2.8}>
              <sphereGeometry args={[0.026, 20, 20]} />
              <meshBasicMaterial
                color={load.sign === -1 ? '#ff7d71' : '#62dcff'}
                transparent
                opacity={0.11}
              />
            </mesh>
          </group>
        )
      })}

      <Line
        points={[geographicEnd.clone().multiplyScalar(-1), geographicEnd]}
        color="#6c7b84"
        transparent
        opacity={0.42}
        lineWidth={1}
      />

      {poleLens && visualMultiplier > 1.001 && (
        <Line
          points={[rawFigureEnd.clone().multiplyScalar(-1), rawFigureEnd]}
          color="#62dcff"
          transparent
          opacity={0.2}
          lineWidth={0.65}
        />
      )}

      <Line
        points={[figureEnd.clone().multiplyScalar(-1), figureEnd]}
        color="#62dcff"
        lineWidth={2.15}
      />
      <Line
        points={[spinEnd.clone().multiplyScalar(-1), spinEnd]}
        color="#f3f7f8"
        transparent
        opacity={0.7}
        lineWidth={1.05}
      />

      {poleLens && figureArc && (
        <Line points={figureArc} color="#62dcff" transparent opacity={0.8} lineWidth={1.6} />
      )}
      {poleLens && spinArc && (
        <Line points={spinArc} color="#f3f7f8" transparent opacity={0.5} lineWidth={0.85} />
      )}

      <mesh position={figureEnd}>
        <sphereGeometry args={[0.024, 16, 16]} />
        <meshBasicMaterial color="#62dcff" />
      </mesh>
      <mesh position={figurePole}>
        <sphereGeometry args={[0.026, 18, 18]} />
        <meshBasicMaterial color="#62dcff" />
      </mesh>
      <mesh position={figurePole} scale={3.4}>
        <sphereGeometry args={[0.026, 18, 18]} />
        <meshBasicMaterial color="#62dcff" transparent opacity={0.08} depthWrite={false} />
      </mesh>

      <mesh position={spinPole} rotation={[0, Math.PI / 4, 0]}>
        <octahedronGeometry args={[0.019, 0]} />
        <meshBasicMaterial color="#f3f7f8" />
      </mesh>
      <mesh position={[0, 1.035, 0]}>
        <sphereGeometry args={[0.014, 14, 14]} />
        <meshBasicMaterial color="#8b9aa1" />
      </mesh>
    </group>
  )
}

function AxisLens({
  shift,
  spinShift,
  azimuth,
  spinAzimuth,
  open,
  onClose,
}: {
  shift: number
  spinShift: number
  azimuth: number
  spinAzimuth: number
  open: boolean
  onClose: () => void
}) {
  const [mode, setMode] = useState<LensMode>('auto')
  const max = Math.max(Math.abs(shift), Math.abs(spinShift), 1e-12)
  const multiplier = mode === '1x' ? 1 : mode === '1e9' ? 1e9 : mode === '1e12' ? 1e12 : null
  const pxPerMeter = multiplier === null ? 62 / max : (70 / EARTH.radius) * multiplier
  const cap = (value: number) => Math.max(-82, Math.min(82, value))
  const figureRad = (azimuth * Math.PI) / 180
  const spinRad = (spinAzimuth * Math.PI) / 180
  const fx = cap(Math.cos(figureRad) * shift * pxPerMeter)
  const fy = cap(Math.sin(figureRad) * shift * pxPerMeter)
  const sx = cap(Math.cos(spinRad) * spinShift * pxPerMeter)
  const sy = cap(Math.sin(spinRad) * spinShift * pxPerMeter)
  const scaleText =
    mode === 'auto'
      ? `AUTO · ${formatDistance(max)} → 62 px`
      : mode === '1x'
        ? 'PHYSICAL 1×'
        : mode === '1e9'
          ? 'VISUAL ×10⁹'
          : 'VISUAL ×10¹²'

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            className="lensBackdrop"
            aria-label="Close axis lens"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="lensPanel"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: 'spring', stiffness: 260, damping: 25 }}
          >
            <div className="lensHead">
              <div>
                <span>AXIS LENS</span>
                <strong>North-pole tangent plane</strong>
              </div>
              <button onClick={onClose} aria-label="Close axis lens">
                <X size={16} />
              </button>
            </div>
            <div className="lensModes">
              {(['1x', '1e9', '1e12', 'auto'] as LensMode[]).map((lensMode) => (
                <button
                  key={lensMode}
                  className={mode === lensMode ? 'active' : ''}
                  onClick={() => setMode(lensMode)}
                >
                  {lensMode === 'auto'
                    ? 'AUTO'
                    : lensMode === '1x'
                      ? '1×'
                      : lensMode === '1e9'
                        ? '10⁹×'
                        : '10¹²×'}
                </button>
              ))}
            </div>
            <div className="lensViz">
              <i className="ring r1" />
              <i className="ring r2" />
              <i className="cross h" />
              <i className="cross v" />
              <span className="cardinal north">N</span>
              <span className="cardinal east">E</span>
              <span className="origin" title="Geographic pole" />
              <motion.span
                className="figureDot"
                animate={{ x: fx, y: -fy }}
                transition={{ type: 'spring', stiffness: 220, damping: 25 }}
                title="Perturbed figure pole"
              />
              <motion.span
                className="spinDot"
                animate={{ x: sx, y: -sy }}
                transition={{ type: 'spring', stiffness: 220, damping: 25 }}
                title="Instantaneous spin-vector pole"
              />
              <span className="scaleLabel">{scaleText}</span>
            </div>
            <div className="lensLegend">
              <span><i className="geo" />Geographic</span>
              <span><i className="fig" />Figure</span>
              <span><i className="spin" />Spin vector</span>
            </div>
            <p className="lensExplain">
              The lens magnifies angular separation only. Reported distances and times remain physical values.
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function PoleLensPanel({
  open,
  physicalShift,
  physicalTilt,
  spinShift,
  multiplier,
  displayTilt,
  capped,
  scaleMode,
  exponent,
  focus,
  onScaleMode,
  onExponent,
  onFocus,
  onClose,
}: {
  open: boolean
  physicalShift: number
  physicalTilt: number
  spinShift: number
  multiplier: number
  displayTilt: number
  capped: boolean
  scaleMode: PoleScaleMode
  exponent: number
  focus: boolean
  onScaleMode: (mode: PoleScaleMode, exponent?: number) => void
  onExponent: (exponent: number) => void
  onFocus: (focus: boolean) => void
  onClose: () => void
}) {
  const sliderExponent = Math.max(0, Math.min(MAX_POLE_EXPONENT, Math.log10(Math.max(1, multiplier))))
  const physicalMicroArcseconds = THREE.MathUtils.radToDeg(physicalTilt) * 3600 * 1e6
  const renderedArc = displayTilt * EARTH.radius

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          className="poleLensPanel"
          aria-label="3D pole lens controls"
          data-visual-multiplier={multiplier}
          data-display-angle={THREE.MathUtils.radToDeg(displayTilt)}
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 8 }}
          transition={{ type: 'spring', stiffness: 260, damping: 27 }}
        >
          <div className="poleLensHead">
            <div>
              <span>3D POLE LENS</span>
              <strong>Globe-space pole separation</strong>
            </div>
            <button onClick={onClose} aria-label="Close 3D pole lens">
              <X size={16} />
            </button>
          </div>

          <div className="poleCameraModes" aria-label="3D pole lens camera">
            <button className={!focus ? 'active' : ''} onClick={() => onFocus(false)}>
              <Globe2 size={13} /> Whole Earth
            </button>
            <button className={focus ? 'active' : ''} onClick={() => onFocus(true)}>
              <Focus size={13} /> North focus
            </button>
          </div>

          <div className="poleScaleControl">
            <div className="poleScaleLabel">
              <span>VISUAL MAGNIFICATION</span>
              <strong>{formatScaleFactor(multiplier)}</strong>
            </div>
            <input
              aria-label="3D pole magnification"
              type="range"
              min="0"
              max={MAX_POLE_EXPONENT}
              step="0.02"
              value={sliderExponent}
              onChange={(event) => onExponent(Number(event.target.value))}
            />
            <div className="poleScalePresets">
              <button
                className={scaleMode === 'manual' && Math.abs(exponent) < 0.01 ? 'active' : ''}
                onClick={() => onScaleMode('manual', 0)}
              >
                1×
              </button>
              <button
                className={scaleMode === 'manual' && Math.abs(exponent - 6) < 0.01 ? 'active' : ''}
                onClick={() => onScaleMode('manual', 6)}
              >
                10⁶×
              </button>
              <button
                className={scaleMode === 'manual' && Math.abs(exponent - 9) < 0.01 ? 'active' : ''}
                onClick={() => onScaleMode('manual', 9)}
              >
                10⁹×
              </button>
              <button className={scaleMode === 'auto' ? 'active' : ''} onClick={() => onScaleMode('auto')}>
                AUTO
              </button>
            </div>
          </div>

          <div className="poleReadouts">
            <div>
              <span>REAL POLE SHIFT</span>
              <strong>{formatDistance(physicalShift)}</strong>
              <small>{physicalMicroArcseconds.toFixed(3)} µas</small>
            </div>
            <div>
              <span>RENDERED ARC</span>
              <strong>{formatDisplayAngle(displayTilt)}</strong>
              <small>{formatDistance(renderedArc)} visual-only</small>
            </div>
          </div>

          <div className="poleLensLegend">
            <span><i className="geo" /> Geographic pole</span>
            <span><i className="fig" /> Figure pole</span>
            <span><i className="spin" /> Spin vector</span>
          </div>

          <p className="poleScaleStatus">
            {capped
              ? 'The requested scale exceeds the 24° display cap. The physical value remains unchanged.'
              : `The cyan pole is exaggerated ${formatScaleFactor(multiplier)} on the actual globe; the real separation is ${formatDistance(physicalShift)}.`}
            {' '}Spin-vector shift: {formatDistance(spinShift)}.
          </p>
        </motion.section>
      )}
    </AnimatePresence>
  )
}

function ScaleContext({ meters }: { meters: number }) {
  const refs = [
    ['hair', 70e-6],
    ['1 mm', 1e-3],
    ['1 cm', 1e-2],
    ['1 m', 1],
  ] as const
  const ratio = Math.max(1e-10, Math.abs(meters))

  return (
    <div className="scaleContext">
      <div className="contextHead">
        <span>SCALE CONTEXT</span>
        <strong>{formatDistance(meters)}</strong>
      </div>
      <div className="contextTrack">
        {refs.map(([label, value]) => {
          const position = Math.max(3, Math.min(97, ((Math.log10(value) + 6) / 6) * 100))
          return (
            <i key={label} style={{ left: `${position}%` }}>
              <b>{label}</b>
            </i>
          )
        })}
        <motion.span
          animate={{ left: `${Math.max(2, Math.min(98, ((Math.log10(ratio) + 6) / 6) * 100))}%` }}
        />
      </div>
    </div>
  )
}

export default function GlobeLab() {
  const reducedMotion = useReducedMotion() ?? false
  const controls = useRef<OrbitControlsImpl>(null)
  const [mode, setMode] = useState<Mode>('add')
  const [mass, setMass] = useState(2.81e11)
  const [target, setTarget] = useState({ lat: 45, lon: 95 })
  const [source, setSource] = useState({ lat: 60, lon: -40 })
  const [scenario, setScenario] = useState('asia')
  const [lensView, setLensView] = useState<LensView>('3d')
  const [poleScaleMode, setPoleScaleMode] = useState<PoleScaleMode>('auto')
  const [poleExponent, setPoleExponent] = useState(9)
  const [poleFocus, setPoleFocus] = useState(false)
  const [details, setDetails] = useState(false)

  const loads = useMemo<Load[]>(
    () =>
      mode === 'add'
        ? [{ massKg: mass, ...target }]
        : [
            { massKg: mass, ...source, sign: -1 },
            { massKg: mass, ...target, sign: 1 },
          ],
    [mass, mode, source, target],
  )
  const result = useMemo(() => computePhysics(loads), [loads])
  const spinAzimuth = ((Math.atan2(result.spinAxis[2], result.spinAxis[0]) * 180) / Math.PI + 360) % 360
  const latitudeFactor = Math.abs(Math.sin((2 * target.lat * Math.PI) / 180))
  const maximumPhysicalTilt = Math.max(result.figureTiltRad, result.spinTiltRad, 1e-18)
  const autoMultiplier = Math.min(10 ** MAX_POLE_EXPONENT, AUTO_DISPLAY_TILT / maximumPhysicalTilt)
  const requestedMultiplier = poleScaleMode === 'auto' ? autoMultiplier : 10 ** poleExponent
  const visualMultiplier = lensView === '3d' ? requestedMultiplier : 1
  const displayFigureTilt = Math.min(result.figureTiltRad * visualMultiplier, MAX_DISPLAY_TILT)
  const displayCapped = maximumPhysicalTilt * visualMultiplier > MAX_DISPLAY_TILT + 1e-12

  const loadScenario = (selected: Scenario) => {
    setScenario(selected.id)
    setMass(selected.massKg)
    if (selected.source && selected.destination) {
      setMode('move')
      setSource(selected.source)
      setTarget(selected.destination)
    } else {
      setMode('add')
      setTarget({ lat: selected.lat, lon: selected.lon })
    }
  }

  const setScalePreset = (scaleMode: PoleScaleMode, exponent?: number) => {
    setPoleScaleMode(scaleMode)
    if (typeof exponent === 'number') setPoleExponent(exponent)
  }

  const current = SCENARIOS.find((item) => item.id === scenario)
  const poleLensOpen = lensView === '3d'
  const axisLensOpen = lensView === '2d'

  return (
    <main className="appShell" data-feature="pole-lens-3d-v1">
      <div className="ambient" />
      <header className="topbar">
        <div className="brand"><span className="brandMark" />GLOBEXPLORE <small>/ ROTATION LAB</small></div>
        <div className="scenarioTitle">
          <span>{current?.kicker ?? 'Custom experiment'}</span>
          <strong>{current?.name ?? 'Custom mass'}</strong>
        </div>
        <div className="topActions">
          <button onClick={() => loadScenario(SCENARIOS[0])} title="Reset"><RotateCcw size={16} /></button>
          <button onClick={() => setDetails(true)} title="About the model"><Info size={16} /></button>
        </div>
      </header>

      <section className="globeStage" aria-label="Interactive Earth model">
        <Canvas
          camera={{ position: [0.2, 0.35, 3.05], fov: 38 }}
          dpr={[1, 1.65]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <color attach="background" args={['#030709']} />
          <fog attach="fog" args={['#030709', 5, 14]} />
          <ambientLight intensity={0.58} />
          <directionalLight position={[3, 2, 4]} intensity={2.7} color="#d8f5ff" />
          <pointLight position={[-3, -2, -2]} intensity={1.75} color="#266782" />
          <Stars
            radius={80}
            depth={30}
            count={1500}
            factor={1.45}
            saturation={0}
            fade
            speed={reducedMotion ? 0 : 0.06}
          />
          <CameraRig
            focus={poleLensOpen && poleFocus}
            reducedMotion={reducedMotion}
            controls={controls}
          />
          <RotatingEarth
            reducedMotion={reducedMotion}
            loads={loads}
            figureAxis={result.figureAxis}
            spinAxis={result.spinAxis}
            visualMultiplier={visualMultiplier}
            poleLens={poleLensOpen}
            poleFocus={poleFocus}
            onPick={(lat, lon) => {
              setScenario('custom')
              setTarget({ lat, lon })
            }}
          />
          <OrbitControls
            ref={controls}
            enablePan={false}
            minDistance={poleLensOpen && poleFocus ? 1.15 : 1.7}
            maxDistance={6}
            dampingFactor={0.055}
            enableDamping
            rotateSpeed={0.55}
          />
        </Canvas>

        <div className="axisLegend">
          <span><i className="original" />geographic axis</span>
          <span><i className="perturbed" />figure axis</span>
          <span><i className="spinAxis" />spin vector</span>
          <em>
            {poleLensOpen
              ? `${formatScaleFactor(visualMultiplier)} visual · ${formatDistance(result.poleShiftM)} real`
              : 'physical 1× separation'}
          </em>
        </div>

        <div className="viewTools" aria-label="Pole visualization tools">
          <button
            className={`poleLensTrigger ${poleLensOpen ? 'active' : ''}`}
            onClick={() => setLensView((view) => (view === '3d' ? null : '3d'))}
          >
            <Orbit size={15} /> 3D pole lens
          </button>
          <button
            className={`lensTrigger ${axisLensOpen ? 'active' : ''}`}
            onClick={() => setLensView((view) => (view === '2d' ? null : '2d'))}
          >
            <Maximize2 size={15} /> 2D axis lens
          </button>
        </div>
      </section>

      <aside className="metrics">
        <div className="metricPrimary">
          <div className="metricLabel">
            <span>FIGURE POLE SHIFT</span>
            <b>{current?.badge ?? 'Rigid model'}</b>
          </div>
          <strong>{formatDistance(result.poleShiftM)}</strong>
          <small>
            {(result.figureTiltRad * 180 / Math.PI * 3600 * 1e6).toFixed(3)} µas · azimuth {result.azimuthDeg.toFixed(1)}°
          </small>
        </div>
        <div className="metricGrid">
          <div><span>Spin-vector shift</span><strong>{formatDistance(result.spinPoleShiftM)}</strong></div>
          <div><span>Center of mass</span><strong>{formatDistance(result.centerOfMassShiftM)}</strong></div>
          <div><span>Length of day</span><strong>{formatTime(result.deltaLodSeconds)}</strong></div>
          <div><span>Earth mass fraction</span><strong>{(Math.abs(result.massFraction) * 100).toExponential(2)}%</strong></div>
        </div>
        <div className="latitudeResponse">
          <div><span>LATITUDE RESPONSE</span><strong>{Math.round(latitudeFactor * 100)}%</strong></div>
          <div className="responseBar"><motion.i animate={{ width: `${latitudeFactor * 100}%` }} /></div>
          <small>Point-load figure-axis coupling peaks near 45° and tends toward zero at 0° / 90°.</small>
        </div>
        <p className="modelNote">
          {current?.note ?? 'Custom rigid-Earth experiment. Change mass or click the globe to explore the geometry.'}
        </p>
      </aside>

      <ScaleContext meters={result.poleShiftM} />

      <div className="controlDock">
        <div className="modeTabs">
          <button className={mode === 'add' ? 'active' : ''} onClick={() => { setMode('add'); setScenario('custom') }}>
            <Plus size={14} /> Add mass
          </button>
          <button className={mode === 'move' ? 'active' : ''} onClick={() => { setMode('move'); setScenario('custom') }}>
            <ArrowRightLeft size={14} /> Move mass
          </button>
        </div>
        <div className="massControl">
          <label>Mass <strong>{formatMass(mass)}</strong></label>
          <input
            aria-label="Mass"
            type="range"
            min="6"
            max="18"
            step=".01"
            value={Math.log10(mass)}
            onChange={(event) => {
              setMass(10 ** Number(event.target.value))
              setScenario('custom')
            }}
          />
        </div>
        <div className="coord">
          <span>Target</span>
          <strong>
            {Math.abs(target.lat).toFixed(1)}°{target.lat >= 0 ? 'N' : 'S'} · {Math.abs(target.lon).toFixed(1)}°{target.lon >= 0 ? 'E' : 'W'}
          </strong>
          <small>Click Earth to reposition</small>
        </div>
      </div>

      <nav className="scenarioRail" aria-label="Scenario presets">
        {SCENARIOS.map((item) => (
          <button
            key={item.id}
            className={scenario === item.id ? 'active' : ''}
            onClick={() => loadScenario(item)}
          >
            <span>{item.kicker}</span>
            <strong>{item.name}</strong>
            <em>{item.badge}</em>
          </button>
        ))}
      </nav>

      <PoleLensPanel
        open={poleLensOpen}
        physicalShift={result.poleShiftM}
        physicalTilt={result.figureTiltRad}
        spinShift={result.spinPoleShiftM}
        multiplier={visualMultiplier}
        displayTilt={displayFigureTilt}
        capped={displayCapped}
        scaleMode={poleScaleMode}
        exponent={poleExponent}
        focus={poleFocus}
        onScaleMode={setScalePreset}
        onExponent={(nextExponent) => {
          setPoleScaleMode('manual')
          setPoleExponent(nextExponent)
        }}
        onFocus={setPoleFocus}
        onClose={() => {
          setLensView(null)
          setPoleFocus(false)
        }}
      />

      <AxisLens
        shift={result.poleShiftM}
        spinShift={result.spinPoleShiftM}
        azimuth={result.azimuthDeg}
        spinAzimuth={spinAzimuth}
        open={axisLensOpen}
        onClose={() => setLensView(null)}
      />

      <AnimatePresence>
        {details && (
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDetails(false)}
          >
            <motion.section
              className="infoSheet"
              initial={{ x: 30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 30, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
            >
              <button className="close" onClick={() => setDetails(false)}><X size={18} /></button>
              <span className="eyebrow">MODEL / V1</span>
              <h2>What the visualization means</h2>
              <p>
                GlobExplore computes how selected surface loads perturb an axisymmetric rigid Earth inertia tensor. It separates the principal <b>figure axis</b> from the instantaneous <b>spin vector</b> and the fixed geographic reference axis.
              </p>
              <p>
                The 3D pole lens multiplies only the angular separation drawn on the globe. The physical pole distance, angular result, mass fraction and timing metrics never change when magnification changes.
              </p>
              <p>
                Internal redistribution conserves total angular momentum in this model. It does not directly change Earth’s orbital obliquity. Real polar motion additionally involves oceans, atmosphere, mantle, elasticity and core coupling.
              </p>
              <div className="formula">ΔI = m[(r · r)I − rrᵀ]</div>
              <p>
                <b>Numerics:</b> microscopic angles use a stable `atan2` formulation so sub-millimetre pole shifts are not rounded to zero when the axial component is indistinguishable from 1 at floating-point precision.
              </p>
              <p>{current?.note}</p>
              <div className="tip"><Move3D size={16} /> Drag to orbit. Pinch or scroll to zoom. Click anywhere on Earth to move the target load.</div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
