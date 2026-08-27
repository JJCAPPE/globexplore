'use client'

import { Canvas, ThreeEvent, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars, Line } from '@react-three/drei'
import { AnimatePresence, motion } from 'motion/react'
import { Info, RotateCcw, Move3D, Plus, ArrowRightLeft, Maximize2, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { computePhysics, formatDistance, formatMass, formatTime, latLonToUnit, Load } from '@/lib/physics'

type Mode = 'add' | 'move'

type Scenario = {
  id: string
  name: string
  kicker: string
  massKg: number
  lat: number
  lon: number
  source?: { lat: number; lon: number }
  note: string
  badge: string
}

const SCENARIOS: Scenario[] = [
  { id:'asia', name:'Asia as a point mass', kicker:'Thought experiment', massKg:2.81e11, lat:45, lon:95, note:'All people in Asia compressed to one point at 45° N to maximize the first-order tilt. This is deliberately unphysical.', badge:'Rigid model' },
  { id:'three-gorges', name:'Three Gorges reservoir', kicker:'Water redistribution', massKg:4.0e13, lat:30.82, lon:111.0, source:{lat:30.82,lon:111}, note:'A simplified surface-load representation of roughly 40 km³ of water. Real hydrological loading is distributed.', badge:'Simplified transfer' },
  { id:'greenland', name:'Greenland ice shift', kicker:'Climate-scale mass transfer', massKg:2.5e14, lat:72, lon:-40, source:{lat:72,lon:-40}, note:'A scale experiment representing 250 Gt moved from Greenland toward lower latitude.', badge:'Simplified transfer' },
  { id:'tohoku', name:'2011 Tōhoku benchmark', kicker:'Published geophysical event', massKg:1e15, lat:38.3, lon:142.4, note:'Earthquakes deform the full 3D Earth. Use this location as a visual benchmark; a surface point mass is not a faithful earthquake model.', badge:'Published benchmark' },
]

function RotatingEarth({ loads, onPick, axis }:{loads:Load[]; onPick:(lat:number,lon:number)=>void; axis:[number,number,number]}) {
  const group = useRef<THREE.Group>(null)
  useFrame((_,dt)=>{ if(group.current) group.current.rotation.y += dt*0.015 })
  const axisEnd = new THREE.Vector3(axis[0],axis[1],axis[2]).normalize().multiplyScalar(1.7)
  const north = new THREE.Vector3(0,1.7,0)
  return <group ref={group}>
    <mesh onPointerDown={(e:ThreeEvent<PointerEvent>)=>{
      e.stopPropagation()
      const p=e.point.clone().normalize()
      const lat=Math.asin(p.y)*180/Math.PI
      const lon=Math.atan2(p.z,p.x)*180/Math.PI
      onPick(lat,lon)
    }}>
      <sphereGeometry args={[1,96,96]} />
      <meshStandardMaterial color="#0c1720" roughness={0.72} metalness={0.06} />
    </mesh>
    <mesh scale={1.006}>
      <sphereGeometry args={[1,48,48]} />
      <meshBasicMaterial color="#59d6ff" wireframe transparent opacity={0.075} />
    </mesh>
    {[-60,-30,0,30,60].map(lat=>{
      const r=Math.cos(lat*Math.PI/180), y=Math.sin(lat*Math.PI/180)
      const pts=Array.from({length:97},(_,i)=>new THREE.Vector3(Math.cos(i/96*Math.PI*2)*r,y,Math.sin(i/96*Math.PI*2)*r))
      return <Line key={lat} points={pts} color="#89a7b7" transparent opacity={lat===0?.25:.08} lineWidth={lat===0?1:.5}/>
    })}
    {loads.map((l,i)=>{
      const u=latLonToUnit(l.lat,l.lon)
      return <group key={`${i}-${l.lat}-${l.lon}`} position={[u[0]*1.035,u[1]*1.035,u[2]*1.035]}>
        <mesh><sphereGeometry args={[.027,20,20]}/><meshBasicMaterial color={l.sign===-1?'#ff7d71':'#f3f7f8'} /></mesh>
        <mesh scale={2.4}><sphereGeometry args={[.027,20,20]}/><meshBasicMaterial color={l.sign===-1?'#ff7d71':'#62dcff'} transparent opacity={.12}/></mesh>
      </group>
    })}
    <Line points={[north.clone().multiplyScalar(-1),north]} color="#6c7b84" transparent opacity={.45} lineWidth={1}/>
    <Line points={[axisEnd.clone().multiplyScalar(-1),axisEnd]} color="#62dcff" lineWidth={2}/>
    <mesh position={axisEnd}><sphereGeometry args={[.025,16,16]}/><meshBasicMaterial color="#62dcff"/></mesh>
  </group>
}

function AxisLens({shift, spinShift, azimuth, open, onClose}:{shift:number;spinShift:number;azimuth:number;open:boolean;onClose:()=>void}) {
  const max=Math.max(Math.abs(shift),Math.abs(spinShift),1e-9)
  const scale=62/max
  const rad=azimuth*Math.PI/180
  const x=Math.cos(rad)*shift*scale, y=Math.sin(rad)*shift*scale
  return <AnimatePresence>{open && <motion.div className="lensPanel" initial={{opacity:0,scale:.96,y:10}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:.97,y:8}} transition={{type:'spring',stiffness:260,damping:25}}>
    <div className="lensHead"><div><span>AXIS LENS</span><strong>North-pole tangent plane</strong></div><button onClick={onClose} aria-label="Close axis lens"><X size={16}/></button></div>
    <div className="lensViz">
      <i className="ring r1"/><i className="ring r2"/><i className="cross h"/><i className="cross v"/>
      <span className="origin" title="Geographic pole"/>
      <motion.span className="figureDot" animate={{x,y:-y}} transition={{type:'spring',stiffness:220,damping:25}} title="Perturbed figure pole"/>
      <span className="scaleLabel">AUTO-FIT · {formatDistance(max)} → 62 px</span>
    </div>
    <div className="lensLegend"><span><i className="geo"/>Geographic pole</span><span><i className="fig"/>Figure pole</span></div>
  </motion.div>}</AnimatePresence>
}

export default function GlobeLab() {
  const [mode,setMode]=useState<Mode>('add')
  const [mass,setMass]=useState(2.81e11)
  const [target,setTarget]=useState({lat:45,lon:95})
  const [source,setSource]=useState({lat:60,lon:-40})
  const [scenario,setScenario]=useState('asia')
  const [lens,setLens]=useState(true)
  const [details,setDetails]=useState(false)

  const loads=useMemo<Load[]>(()=>mode==='add' ? [{massKg:mass,...target}] : [{massKg:mass,...source,sign:-1},{massKg:mass,...target,sign:1}], [mode,mass,target,source])
  const result=useMemo(()=>computePhysics(loads),[loads])

  const loadScenario=(s:Scenario)=>{
    setScenario(s.id);setMass(s.massKg);setTarget({lat:s.lat,lon:s.lon});
    if(s.source){setMode('move');setSource(s.source);setTarget({lat:15,lon:s.lon+20})} else setMode('add')
  }
  const current=SCENARIOS.find(s=>s.id===scenario)

  return <main className="appShell">
    <div className="ambient"/>
    <header className="topbar">
      <div className="brand"><span className="brandMark"/>GLOBEXPLORE <small>/ ROTATION LAB</small></div>
      <div className="scenarioTitle"><span>{current?.kicker ?? 'Custom experiment'}</span><strong>{current?.name ?? 'Custom mass'}</strong></div>
      <div className="topActions"><button onClick={()=>loadScenario(SCENARIOS[0])} title="Reset"><RotateCcw size={16}/></button><button onClick={()=>setDetails(true)} title="About the model"><Info size={16}/></button></div>
    </header>

    <section className="globeStage" aria-label="Interactive Earth model">
      <Canvas camera={{position:[0.2,.35,3.05],fov:38}} dpr={[1,1.75]} gl={{antialias:true,powerPreference:'high-performance'}}>
        <color attach="background" args={['#030709']}/>
        <ambientLight intensity={.65}/><directionalLight position={[3,2,4]} intensity={2.5} color="#d8f5ff"/>
        <pointLight position={[-3,-2,-2]} intensity={1.6} color="#266782"/>
        <Stars radius={80} depth={30} count={1800} factor={1.5} saturation={0} fade speed={.08}/>
        <RotatingEarth loads={loads} axis={result.figureAxis} onPick={(lat,lon)=>{setScenario('custom');setTarget({lat,lon})}}/>
        <OrbitControls enablePan={false} minDistance={1.7} maxDistance={6} dampingFactor={.055} enableDamping rotateSpeed={.55}/>
      </Canvas>
      <div className="axisLegend"><span><i className="original"/>geographic axis</span><span><i className="perturbed"/>perturbed figure axis</span></div>
      <button className="lensTrigger" onClick={()=>setLens(v=>!v)}><Maximize2 size={15}/> Axis lens</button>
    </section>

    <aside className="metrics">
      <div className="metricPrimary"><span>FIGURE POLE SHIFT</span><strong>{formatDistance(result.poleShiftM)}</strong><small>{(result.figureTiltRad*180/Math.PI*3600*1e6).toFixed(2)} µas · azimuth {result.azimuthDeg.toFixed(1)}°</small></div>
      <div className="metricGrid">
        <div><span>Spin-vector shift</span><strong>{formatDistance(result.spinPoleShiftM)}</strong></div>
        <div><span>Center of mass</span><strong>{formatDistance(result.centerOfMassShiftM)}</strong></div>
        <div><span>Length of day</span><strong>{formatTime(result.deltaLodSeconds)}</strong></div>
        <div><span>Earth mass fraction</span><strong>{(Math.abs(result.massFraction)*100).toExponential(2)}%</strong></div>
      </div>
      <p className="modelNote"><b>{current?.badge ?? 'Rigid model'}</b> · Values are a rigid-Earth estimate. Visual axis separation is magnified; numbers are not.</p>
    </aside>

    <div className="controlDock">
      <div className="modeTabs"><button className={mode==='add'?'active':''} onClick={()=>{setMode('add');setScenario('custom')}}><Plus size={14}/> Add mass</button><button className={mode==='move'?'active':''} onClick={()=>{setMode('move');setScenario('custom')}}><ArrowRightLeft size={14}/> Move mass</button></div>
      <div className="massControl"><label>Mass <strong>{formatMass(mass)}</strong></label><input aria-label="Mass" type="range" min="6" max="18" step=".01" value={Math.log10(mass)} onChange={e=>{setMass(10**Number(e.target.value));setScenario('custom')}}/></div>
      <div className="coord"><span>Target</span><strong>{Math.abs(target.lat).toFixed(1)}°{target.lat>=0?'N':'S'} · {Math.abs(target.lon).toFixed(1)}°{target.lon>=0?'E':'W'}</strong><small>Click Earth to reposition</small></div>
    </div>

    <nav className="scenarioRail" aria-label="Scenario presets">{SCENARIOS.map(s=><button key={s.id} className={scenario===s.id?'active':''} onClick={()=>loadScenario(s)}><span>{s.kicker}</span><strong>{s.name}</strong></button>)}</nav>

    <AxisLens shift={result.poleShiftM} spinShift={result.spinPoleShiftM} azimuth={result.azimuthDeg} open={lens} onClose={()=>setLens(false)}/>

    <AnimatePresence>{details&&<motion.div className="scrim" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setDetails(false)}><motion.section className="infoSheet" initial={{x:30,opacity:0}} animate={{x:0,opacity:1}} exit={{x:30,opacity:0}} onClick={e=>e.stopPropagation()}>
      <button className="close" onClick={()=>setDetails(false)}><X size={18}/></button><span className="eyebrow">MODEL / V1</span><h2>What the visualization means</h2><p>GlobExplore computes how selected surface loads perturb an axisymmetric rigid Earth inertia tensor. It separates the principal <b>figure axis</b> from the instantaneous <b>spin vector</b> and the fixed geographic reference axis.</p><p>Internal redistribution conserves total angular momentum in this model. It does not directly change Earth’s orbital obliquity. Real polar motion additionally involves oceans, atmosphere, mantle, elasticity and core coupling.</p><div className="formula">ΔI = m[(r · r)I − rrᵀ]</div><p>{current?.note}</p><div className="tip"><Move3D size={16}/> Drag to orbit. Pinch or scroll to zoom. Click anywhere on Earth to move the target load.</div>
    </motion.section></motion.div>}</AnimatePresence>
  </main>
}
