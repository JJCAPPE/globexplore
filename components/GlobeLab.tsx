'use client'

import { Canvas, ThreeEvent, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars, Line } from '@react-three/drei'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Info, RotateCcw, Move3D, Plus, ArrowRightLeft, Maximize2, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { computePhysics, EARTH, formatDistance, formatMass, formatTime, latLonToUnit, Load } from '@/lib/physics'

type Mode = 'add' | 'move'
type LensMode = 'auto' | '1x' | '1e9' | '1e12'

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

const SCENARIOS: Scenario[] = [
  { id:'asia', name:'Asia as a point mass', kicker:'Thought experiment', massKg:2.81e11, lat:45, lon:95, note:'All people in Asia compressed to one point at 45° N to maximize the first-order figure-axis response. The mass is not actually added to Earth.', badge:'Rigid model' },
  { id:'three-gorges', name:'Three Gorges reservoir', kicker:'Water redistribution', massKg:4.0e13, lat:30.82, lon:111.0, source:{lat:18,lon:95}, destination:{lat:30.82,lon:111}, note:'A simplified 40 Gt surface transfer toward the Three Gorges region. Real reservoir loading is distributed and coupled to the solid Earth.', badge:'Simplified transfer' },
  { id:'greenland', name:'Greenland ice shift', kicker:'Climate-scale mass transfer', massKg:2.5e14, lat:72, lon:-40, source:{lat:72,lon:-40}, destination:{lat:25,lon:-25}, note:'A scale experiment moving 250 Gt from Greenland toward lower latitude. It illustrates geometry, not a complete ocean-loading solution.', badge:'Simplified transfer' },
  { id:'tohoku', name:'2011 Tōhoku benchmark', kicker:'Published geophysical event', massKg:1e15, lat:38.3, lon:142.4, note:'Earthquakes deform the full 3D Earth. This surface load is only a spatial scale experiment and must not be read as a reconstruction of the 2011 event.', badge:'Published benchmark context' },
]

function transferArc(loads: Load[]) {
  const from=loads.find(l=>l.sign===-1), to=loads.find(l=>l.sign===1)
  if(!from || !to) return null
  const a=new THREE.Vector3(...latLonToUnit(from.lat,from.lon)).normalize()
  const b=new THREE.Vector3(...latLonToUnit(to.lat,to.lon)).normalize()
  const dot=THREE.MathUtils.clamp(a.dot(b),-1,1)
  const angle=Math.acos(dot)
  if(angle<1e-6) return null
  const sin=Math.sin(angle)
  return Array.from({length:65},(_,i)=>{
    const t=i/64
    const p=a.clone().multiplyScalar(Math.sin((1-t)*angle)/sin).add(b.clone().multiplyScalar(Math.sin(t*angle)/sin)).normalize()
    const lift=1.035 + Math.sin(Math.PI*t)*0.09
    return p.multiplyScalar(lift)
  })
}

function RotatingEarth({ loads, onPick, axis, reducedMotion }:{loads:Load[]; onPick:(lat:number,lon:number)=>void; axis:[number,number,number]; reducedMotion:boolean}) {
  const group = useRef<THREE.Group>(null)
  useFrame((_,dt)=>{ if(group.current && !reducedMotion) group.current.rotation.y += dt*0.012 })
  const axisEnd = new THREE.Vector3(axis[0],axis[1],axis[2]).normalize().multiplyScalar(1.72)
  const north = new THREE.Vector3(0,1.72,0)
  const arc=useMemo(()=>transferArc(loads),[loads])
  return <group ref={group}>
    <mesh onPointerDown={(e:ThreeEvent<PointerEvent>)=>{
      e.stopPropagation()
      const local=e.point.clone()
      if(group.current) group.current.worldToLocal(local)
      const p=local.normalize()
      const lat=Math.asin(p.y)*180/Math.PI
      const lon=Math.atan2(p.z,p.x)*180/Math.PI
      onPick(lat,lon)
    }}>
      <sphereGeometry args={[1,96,96]} />
      <meshStandardMaterial color="#09151c" roughness={0.68} metalness={0.08} />
    </mesh>
    <mesh scale={1.018}>
      <sphereGeometry args={[1,64,64]} />
      <meshBasicMaterial color="#5cdcff" side={THREE.BackSide} transparent opacity={0.055} depthWrite={false}/>
    </mesh>
    <mesh scale={1.004}>
      <sphereGeometry args={[1,48,48]} />
      <meshBasicMaterial color="#59d6ff" wireframe transparent opacity={0.045} />
    </mesh>
    {[-60,-30,0,30,60].map(lat=>{
      const r=Math.cos(lat*Math.PI/180), y=Math.sin(lat*Math.PI/180)
      const pts=Array.from({length:97},(_,i)=>new THREE.Vector3(Math.cos(i/96*Math.PI*2)*r,y,Math.sin(i/96*Math.PI*2)*r))
      return <Line key={`lat-${lat}`} points={pts} color="#89a7b7" transparent opacity={lat===0?.30:.075} lineWidth={lat===0?1:.45}/>
    })}
    {[-150,-120,-90,-60,-30,0,30,60,90,120,150].map(lon=>{
      const l=lon*Math.PI/180
      const pts=Array.from({length:65},(_,i)=>{
        const p=-Math.PI/2+i/64*Math.PI
        return new THREE.Vector3(Math.cos(p)*Math.cos(l),Math.sin(p),Math.cos(p)*Math.sin(l))
      })
      return <Line key={`lon-${lon}`} points={pts} color="#89a7b7" transparent opacity={.055} lineWidth={.45}/>
    })}
    {arc && <Line points={arc} color="#f3f7f8" transparent opacity={.55} lineWidth={1.2}/>} 
    {loads.map((l,i)=>{
      const u=latLonToUnit(l.lat,l.lon)
      return <group key={`${i}-${l.lat}-${l.lon}`} position={[u[0]*1.035,u[1]*1.035,u[2]*1.035]}>
        <mesh><sphereGeometry args={[.026,20,20]}/><meshBasicMaterial color={l.sign===-1?'#ff7d71':'#f3f7f8'} /></mesh>
        <mesh scale={2.8}><sphereGeometry args={[.026,20,20]}/><meshBasicMaterial color={l.sign===-1?'#ff7d71':'#62dcff'} transparent opacity={.11}/></mesh>
      </group>
    })}
    <Line points={[north.clone().multiplyScalar(-1),north]} color="#6c7b84" transparent opacity={.42} lineWidth={1}/>
    <Line points={[axisEnd.clone().multiplyScalar(-1),axisEnd]} color="#62dcff" lineWidth={2}/>
    <mesh position={axisEnd}><sphereGeometry args={[.024,16,16]}/><meshBasicMaterial color="#62dcff"/></mesh>
    <mesh position={[0,1.035,0]}><sphereGeometry args={[.014,14,14]}/><meshBasicMaterial color="#d7e4e8"/></mesh>
  </group>
}

function AxisLens({shift, spinShift, azimuth, spinAzimuth, open, onClose}:{shift:number;spinShift:number;azimuth:number;spinAzimuth:number;open:boolean;onClose:()=>void}) {
  const [mode,setMode]=useState<LensMode>('auto')
  const max=Math.max(Math.abs(shift),Math.abs(spinShift),1e-12)
  const multiplier=mode==='1x'?1:mode==='1e9'?1e9:mode==='1e12'?1e12:null
  const pxPerMeter=multiplier===null ? 62/max : 70/EARTH.radius*multiplier
  const cap=(v:number)=>Math.max(-82,Math.min(82,v))
  const figureRad=azimuth*Math.PI/180
  const spinRad=spinAzimuth*Math.PI/180
  const fx=cap(Math.cos(figureRad)*shift*pxPerMeter), fy=cap(Math.sin(figureRad)*shift*pxPerMeter)
  const sx=cap(Math.cos(spinRad)*spinShift*pxPerMeter), sy=cap(Math.sin(spinRad)*spinShift*pxPerMeter)
  const scaleText=mode==='auto'?`AUTO · ${formatDistance(max)} → 62 px`:mode==='1x'?'PHYSICAL 1×':mode==='1e9'?'VISUAL ×10⁹':'VISUAL ×10¹²'
  return <AnimatePresence>{open && <motion.div className="lensPanel" initial={{opacity:0,scale:.96,y:10}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:.97,y:8}} transition={{type:'spring',stiffness:260,damping:25}}>
    <div className="lensHead"><div><span>AXIS LENS</span><strong>North-pole tangent plane</strong></div><button onClick={onClose} aria-label="Close axis lens"><X size={16}/></button></div>
    <div className="lensModes">{(['1x','1e9','1e12','auto'] as LensMode[]).map(m=><button key={m} className={mode===m?'active':''} onClick={()=>setMode(m)}>{m==='auto'?'AUTO':m==='1x'?'1×':m==='1e9'?'10⁹×':'10¹²×'}</button>)}</div>
    <div className="lensViz">
      <i className="ring r1"/><i className="ring r2"/><i className="cross h"/><i className="cross v"/>
      <span className="cardinal north">N</span><span className="cardinal east">E</span>
      <span className="origin" title="Geographic pole"/>
      <motion.span className="figureDot" animate={{x:fx,y:-fy}} transition={{type:'spring',stiffness:220,damping:25}} title="Perturbed figure pole"/>
      <motion.span className="spinDot" animate={{x:sx,y:-sy}} transition={{type:'spring',stiffness:220,damping:25}} title="Instantaneous spin-vector pole"/>
      <span className="scaleLabel">{scaleText}</span>
    </div>
    <div className="lensLegend"><span><i className="geo"/>Geographic</span><span><i className="fig"/>Figure</span><span><i className="spin"/>Spin vector</span></div>
    <p className="lensExplain">The lens magnifies angular separation only. Reported distances and times remain physical values.</p>
  </motion.div>}</AnimatePresence>
}

function ScaleContext({meters}:{meters:number}) {
  const refs=[['hair',70e-6],['1 mm',1e-3],['1 cm',1e-2],['1 m',1]] as const
  const ratio=Math.max(1e-10,Math.abs(meters))
  return <div className="scaleContext"><div className="contextHead"><span>SCALE CONTEXT</span><strong>{formatDistance(meters)}</strong></div><div className="contextTrack">{refs.map(([label,value])=>{
    const pos=Math.max(3,Math.min(97,(Math.log10(value)+6)/6*100))
    return <i key={label} style={{left:`${pos}%`}}><b>{label}</b></i>
  })}<motion.span animate={{left:`${Math.max(2,Math.min(98,(Math.log10(ratio)+6)/6*100))}%`}}/></div></div>
}

export default function GlobeLab() {
  const reducedMotion=useReducedMotion() ?? false
  const [mode,setMode]=useState<Mode>('add')
  const [mass,setMass]=useState(2.81e11)
  const [target,setTarget]=useState({lat:45,lon:95})
  const [source,setSource]=useState({lat:60,lon:-40})
  const [scenario,setScenario]=useState('asia')
  const [lens,setLens]=useState(true)
  const [details,setDetails]=useState(false)

  const loads=useMemo<Load[]>(()=>mode==='add' ? [{massKg:mass,...target}] : [{massKg:mass,...source,sign:-1},{massKg:mass,...target,sign:1}], [mode,mass,target,source])
  const result=useMemo(()=>computePhysics(loads),[loads])
  const spinAzimuth=((Math.atan2(result.spinAxis[2],result.spinAxis[0])*180/Math.PI)+360)%360
  const latitudeFactor=Math.abs(Math.sin(2*target.lat*Math.PI/180))

  const loadScenario=(s:Scenario)=>{
    setScenario(s.id);setMass(s.massKg)
    if(s.source && s.destination){setMode('move');setSource(s.source);setTarget(s.destination)}
    else {setMode('add');setTarget({lat:s.lat,lon:s.lon})}
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
      <Canvas camera={{position:[0.2,.35,3.05],fov:38}} dpr={[1,1.65]} gl={{antialias:true,powerPreference:'high-performance'}}>
        <color attach="background" args={['#030709']}/>
        <fog attach="fog" args={['#030709',5,14]}/>
        <ambientLight intensity={.58}/><directionalLight position={[3,2,4]} intensity={2.7} color="#d8f5ff"/>
        <pointLight position={[-3,-2,-2]} intensity={1.75} color="#266782"/>
        <Stars radius={80} depth={30} count={1500} factor={1.45} saturation={0} fade speed={reducedMotion?0:.06}/>
        <RotatingEarth reducedMotion={reducedMotion} loads={loads} axis={result.figureAxis} onPick={(lat,lon)=>{setScenario('custom');setTarget({lat,lon})}}/>
        <OrbitControls enablePan={false} minDistance={1.7} maxDistance={6} dampingFactor={.055} enableDamping rotateSpeed={.55}/>
      </Canvas>
      <div className="axisLegend"><span><i className="original"/>geographic axis</span><span><i className="perturbed"/>perturbed figure axis</span><em>visual-only separation</em></div>
      <button className="lensTrigger" onClick={()=>setLens(v=>!v)}><Maximize2 size={15}/> Axis lens</button>
    </section>

    <aside className="metrics">
      <div className="metricPrimary"><div className="metricLabel"><span>FIGURE POLE SHIFT</span><b>{current?.badge ?? 'Rigid model'}</b></div><strong>{formatDistance(result.poleShiftM)}</strong><small>{(result.figureTiltRad*180/Math.PI*3600*1e6).toFixed(3)} µas · azimuth {result.azimuthDeg.toFixed(1)}°</small></div>
      <div className="metricGrid">
        <div><span>Spin-vector shift</span><strong>{formatDistance(result.spinPoleShiftM)}</strong></div>
        <div><span>Center of mass</span><strong>{formatDistance(result.centerOfMassShiftM)}</strong></div>
        <div><span>Length of day</span><strong>{formatTime(result.deltaLodSeconds)}</strong></div>
        <div><span>Earth mass fraction</span><strong>{(Math.abs(result.massFraction)*100).toExponential(2)}%</strong></div>
      </div>
      <div className="latitudeResponse"><div><span>LATITUDE RESPONSE</span><strong>{Math.round(latitudeFactor*100)}%</strong></div><div className="responseBar"><motion.i animate={{width:`${latitudeFactor*100}%`}}/></div><small>Point-load figure-axis coupling peaks near 45° and tends toward zero at 0° / 90°.</small></div>
      <p className="modelNote">{current?.note ?? 'Custom rigid-Earth experiment. Change mass or click the globe to explore the geometry.'}</p>
    </aside>

    <ScaleContext meters={result.poleShiftM}/>

    <div className="controlDock">
      <div className="modeTabs"><button className={mode==='add'?'active':''} onClick={()=>{setMode('add');setScenario('custom')}}><Plus size={14}/> Add mass</button><button className={mode==='move'?'active':''} onClick={()=>{setMode('move');setScenario('custom')}}><ArrowRightLeft size={14}/> Move mass</button></div>
      <div className="massControl"><label>Mass <strong>{formatMass(mass)}</strong></label><input aria-label="Mass" type="range" min="6" max="18" step=".01" value={Math.log10(mass)} onChange={e=>{setMass(10**Number(e.target.value));setScenario('custom')}}/></div>
      <div className="coord"><span>Target</span><strong>{Math.abs(target.lat).toFixed(1)}°{target.lat>=0?'N':'S'} · {Math.abs(target.lon).toFixed(1)}°{target.lon>=0?'E':'W'}</strong><small>Click Earth to reposition</small></div>
    </div>

    <nav className="scenarioRail" aria-label="Scenario presets">{SCENARIOS.map(s=><button key={s.id} className={scenario===s.id?'active':''} onClick={()=>loadScenario(s)}><span>{s.kicker}</span><strong>{s.name}</strong><em>{s.badge}</em></button>)}</nav>

    <AxisLens shift={result.poleShiftM} spinShift={result.spinPoleShiftM} azimuth={result.azimuthDeg} spinAzimuth={spinAzimuth} open={lens} onClose={()=>setLens(false)}/>

    <AnimatePresence>{details&&<motion.div className="scrim" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setDetails(false)}><motion.section className="infoSheet" initial={{x:30,opacity:0}} animate={{x:0,opacity:1}} exit={{x:30,opacity:0}} onClick={e=>e.stopPropagation()}>
      <button className="close" onClick={()=>setDetails(false)}><X size={18}/></button><span className="eyebrow">MODEL / V1</span><h2>What the visualization means</h2><p>GlobExplore computes how selected surface loads perturb an axisymmetric rigid Earth inertia tensor. It separates the principal <b>figure axis</b> from the instantaneous <b>spin vector</b> and the fixed geographic reference axis.</p><p>Internal redistribution conserves total angular momentum in this model. It does not directly change Earth’s orbital obliquity. Real polar motion additionally involves oceans, atmosphere, mantle, elasticity and core coupling.</p><div className="formula">ΔI = m[(r · r)I − rrᵀ]</div><p><b>Numerics:</b> microscopic angles use a stable `atan2` formulation so sub-millimetre pole shifts are not rounded to zero when the axial component is indistinguishable from 1 at floating-point precision.</p><p>{current?.note}</p><div className="tip"><Move3D size={16}/> Drag to orbit. Pinch or scroll to zoom. Click anywhere on Earth to move the target load.</div>
    </motion.section></motion.div>}</AnimatePresence>
  </main>
}
