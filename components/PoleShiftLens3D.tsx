'use client'

import { Canvas, type ThreeEvent, useFrame } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { EARTH, type Vec3 } from '@/lib/physics'

export type PoleLensScale = 'auto' | '1x' | '1e9' | '1e12'
export type PoleLensFocus = 'both' | 'figure' | 'spin'
export type PoleLensView = 'orbit' | 'pole' | 'side'

export type PoleLensAxis = Exclude<PoleLensFocus, 'both'>

const PLANE_Y = 1.08
const MAX_PLANE_OFFSET = 0.62
const MAX_DISPLAY_ANGLE = Math.atan(MAX_PLANE_OFFSET / PLANE_Y)
const Y_AXIS = new THREE.Vector3(0, 1, 0)

const CAMERA: Record<PoleLensView, { position: [number, number, number]; up: [number, number, number]; fov: number }> = {
  orbit: { position: [2.55, 1.65, 2.55], up: [0, 1, 0], fov: 34 },
  pole: { position: [0.01, 3.45, 0.42], up: [0, 0, -1], fov: 30 },
  side: { position: [3.25, 0.55, 0.01], up: [0, 1, 0], fov: 33 },
}

function scaleMultiplier(scale: PoleLensScale) {
  if (scale === '1x') return 1
  if (scale === '1e9') return 1e9
  if (scale === '1e12') return 1e12
  return null
}

function visualAxis(axis: Vec3, shiftM: number, maxShiftM: number, scale: PoleLensScale): Vec3 {
  const horizontal = Math.hypot(axis[0], axis[2])
  const directionX = horizontal > 1e-20 ? axis[0] / horizontal : 1
  const directionZ = horizontal > 1e-20 ? axis[2] / horizontal : 0
  const multiplier = scaleMultiplier(scale)
  const angle = multiplier === null
    ? Math.atan((Math.abs(shiftM) / Math.max(maxShiftM, 1e-20)) * MAX_PLANE_OFFSET / PLANE_Y)
    : Math.min(Math.abs(shiftM) / EARTH.radius * multiplier, MAX_DISPLAY_ANGLE)
  const radial = Math.sin(angle)
  return [directionX * radial, Math.cos(angle), directionZ * radial]
}

function circlePoints(radius: number, y = PLANE_Y, count = 96) {
  return Array.from({ length: count + 1 }, (_, index) => {
    const angle = index / count * Math.PI * 2
    return new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
  })
}

function latitudePoints(latitudeDeg: number, radius = 0.8, count = 96) {
  const latitude = latitudeDeg * Math.PI / 180
  const ringRadius = Math.cos(latitude) * radius
  const y = Math.sin(latitude) * radius
  return Array.from({ length: count + 1 }, (_, index) => {
    const angle = index / count * Math.PI * 2
    return new THREE.Vector3(Math.cos(angle) * ringRadius, y, Math.sin(angle) * ringRadius)
  })
}

function planeIntersection(axis: THREE.Vector3) {
  const factor = PLANE_Y / Math.max(axis.y, 0.15)
  return axis.clone().multiplyScalar(factor).setY(PLANE_Y + 0.012)
}

function InteractiveAxis({
  kind,
  axis,
  color,
  focus,
  reducedMotion,
  onFocus,
}: {
  kind: PoleLensAxis
  axis: Vec3
  color: string
  focus: PoleLensFocus
  reducedMotion: boolean
  onFocus: (kind: PoleLensAxis) => void
}) {
  const axisGroup = useRef<THREE.Group>(null)
  const markerGroup = useRef<THREE.Group>(null)
  const currentAxis = useRef(new THREE.Vector3(...axis).normalize())
  const targetAxis = useMemo(() => new THREE.Vector3(...axis).normalize(), [axis])
  const trailGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, PLANE_Y + 0.012, 0,
      0, PLANE_Y + 0.012, 0,
    ], 3))
    return geometry
  }, [])
  const trailLine = useMemo(() => {
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.42,
      depthTest: false,
    })
    const line = new THREE.Line(trailGeometry, material)
    line.renderOrder = 4
    return line
  }, [color, trailGeometry])
  const active = focus === 'both' || focus === kind
  const selected = focus === kind
  const opacity = active ? 0.95 : 0.14

  useEffect(() => {
    const material = trailLine.material as THREE.LineBasicMaterial
    material.opacity = active ? 0.42 : 0.08
    material.needsUpdate = true
  }, [active, trailLine])

  useEffect(() => () => {
    trailGeometry.dispose()
    ;(trailLine.material as THREE.Material).dispose()
  }, [trailGeometry, trailLine])

  useFrame((_, delta) => {
    const blend = reducedMotion ? 1 : 1 - Math.exp(-delta * 9)
    currentAxis.current.lerp(targetAxis, blend).normalize()
    axisGroup.current?.quaternion.setFromUnitVectors(Y_AXIS, currentAxis.current)

    const point = planeIntersection(currentAxis.current)
    markerGroup.current?.position.copy(point)
    const positions = trailGeometry.getAttribute('position') as THREE.BufferAttribute
    positions.setXYZ(0, 0, PLANE_Y + 0.012, 0)
    positions.setXYZ(1, point.x, PLANE_Y + 0.012, point.z)
    positions.needsUpdate = true
  })

  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onFocus(kind)
  }

  return (
    <>
      <group ref={axisGroup}>
        <Line
          points={[[0, -1.06, 0], [0, 1.28, 0]]}
          color={color}
          lineWidth={selected ? 3 : 2.1}
          transparent
          opacity={opacity}
          depthTest={false}
        />
        <mesh
          position={[0, 0.08, 0]}
          onClick={select}
          onPointerOver={(event) => {
            event.stopPropagation()
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => { document.body.style.cursor = '' }}
        >
          <cylinderGeometry args={[0.045, 0.045, 2.45, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>

      <primitive object={trailLine} />

      <group ref={markerGroup}>
        <mesh onClick={select} renderOrder={5}>
          <sphereGeometry args={[selected ? 0.042 : 0.034, 22, 22]} />
          <meshBasicMaterial color={color} transparent opacity={opacity} depthTest={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}>
          <ringGeometry args={[0.052, selected ? 0.078 : 0.069, 36]} />
          <meshBasicMaterial color={color} transparent opacity={active ? 0.24 : 0.05} side={THREE.DoubleSide} depthTest={false} />
        </mesh>
      </group>
    </>
  )
}

function GeographicAxis() {
  return (
    <>
      <Line
        points={[[0, -1.06, 0], [0, 1.3, 0]]}
        color="#6c7b84"
        lineWidth={1.25}
        transparent
        opacity={0.72}
        depthTest={false}
      />
      <mesh position={[0, PLANE_Y + 0.012, 0]} renderOrder={5}>
        <sphereGeometry args={[0.027, 18, 18]} />
        <meshBasicMaterial color="#71838c" depthTest={false} />
      </mesh>
    </>
  )
}

function PoleLensScene({
  figureAxis,
  spinAxis,
  figureShiftM,
  spinShiftM,
  scale,
  focus,
  view,
  autoRotate,
  reducedMotion,
  onFocus,
}: Omit<PoleShiftLens3DProps, 'scaleLabel'>) {
  const maxShiftM = Math.max(Math.abs(figureShiftM), Math.abs(spinShiftM), 1e-20)
  const displayedFigure = useMemo(
    () => visualAxis(figureAxis, figureShiftM, maxShiftM, scale),
    [figureAxis, figureShiftM, maxShiftM, scale],
  )
  const displayedSpin = useMemo(
    () => visualAxis(spinAxis, spinShiftM, maxShiftM, scale),
    [spinAxis, spinShiftM, maxShiftM, scale],
  )
  const planeRings = useMemo(() => [0.24, 0.44, 0.64].map((radius) => circlePoints(radius)), [])
  const earthRings = useMemo(() => [-45, 0, 45].map((latitude) => latitudePoints(latitude)), [])

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[3, 3, 4]} intensity={2.4} color="#d8f5ff" />
      <pointLight position={[-2, -1, -3]} intensity={1.6} color="#24627d" />

      <mesh renderOrder={0}>
        <sphereGeometry args={[0.8, 64, 64]} />
        <meshStandardMaterial color="#0a1820" roughness={0.66} metalness={0.12} transparent opacity={0.68} depthWrite={false} />
      </mesh>
      <mesh scale={1.007} renderOrder={0}>
        <sphereGeometry args={[0.8, 40, 40]} />
        <meshBasicMaterial color="#69dfff" wireframe transparent opacity={0.07} depthWrite={false} />
      </mesh>
      {earthRings.map((points, index) => (
        <Line key={index} points={points} color="#78929d" transparent opacity={index === 1 ? 0.18 : 0.09} lineWidth={0.55} />
      ))}
      <mesh>
        <sphereGeometry args={[0.055, 24, 24]} />
        <meshBasicMaterial color="#24343b" />
      </mesh>

      <mesh position={[0, PLANE_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <circleGeometry args={[0.69, 64]} />
        <meshBasicMaterial color="#10242c" transparent opacity={0.34} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {planeRings.map((points, index) => (
        <Line key={`plane-${index}`} points={points} color="#8bb9c9" transparent opacity={0.16 - index * 0.025} lineWidth={0.6} depthTest={false} />
      ))}
      <Line points={[[-0.69, PLANE_Y, 0], [0.69, PLANE_Y, 0]]} color="#8bb9c9" transparent opacity={0.13} lineWidth={0.55} depthTest={false} />
      <Line points={[[0, PLANE_Y, -0.69], [0, PLANE_Y, 0.69]]} color="#8bb9c9" transparent opacity={0.13} lineWidth={0.55} depthTest={false} />

      <GeographicAxis />
      <InteractiveAxis kind="figure" axis={displayedFigure} color="#62dcff" focus={focus} reducedMotion={reducedMotion} onFocus={onFocus} />
      <InteractiveAxis kind="spin" axis={displayedSpin} color="#f3f7f8" focus={focus} reducedMotion={reducedMotion} onFocus={onFocus} />

      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.07}
        minDistance={2.1}
        maxDistance={5.3}
        rotateSpeed={0.58}
        zoomSpeed={0.7}
        target={[0, 0.18, 0]}
        autoRotate={autoRotate && view === 'orbit' && !reducedMotion}
        autoRotateSpeed={0.55}
      />
    </>
  )
}

export type PoleShiftLens3DProps = {
  figureAxis: Vec3
  spinAxis: Vec3
  figureShiftM: number
  spinShiftM: number
  scale: PoleLensScale
  scaleLabel: string
  focus: PoleLensFocus
  view: PoleLensView
  autoRotate: boolean
  reducedMotion: boolean
  onFocus: (kind: PoleLensAxis) => void
}

export default function PoleShiftLens3D(props: PoleShiftLens3DProps) {
  const camera = CAMERA[props.view]

  return (
    <div className="poleLensCanvas">
      <Canvas
        key={props.view}
        camera={{ position: camera.position, fov: camera.fov, near: 0.1, far: 50 }}
        dpr={[1, 1.6]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ camera: sceneCamera }) => {
          sceneCamera.up.set(...camera.up)
          sceneCamera.lookAt(0, 0.18, 0)
        }}
      >
        <color attach="background" args={['#050b0e']} />
        <fog attach="fog" args={['#050b0e', 4.6, 10]} />
        <PoleLensScene {...props} />
      </Canvas>
      <div className="lens3dHud" aria-hidden="true">
        <span>{props.scaleLabel}</span>
        <span>Drag · pinch / scroll</span>
      </div>
    </div>
  )
}
