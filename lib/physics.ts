export const EARTH = {
  mass: 5.9722e24,
  radius: 6_371_000,
  j2: 1.08262668e-3,
  cbar: 0.3307,
  siderealDay: 86164.0905,
}

export type Vec3 = [number, number, number]
export type Load = { massKg: number; lat: number; lon: number; sign?: 1 | -1 }
export type PhysicsResult = {
  figureAxis: Vec3
  spinAxis: Vec3
  figureTiltRad: number
  spinTiltRad: number
  poleShiftM: number
  spinPoleShiftM: number
  centerOfMassShiftM: number
  deltaLodSeconds: number
  azimuthDeg: number
  massFraction: number
}

type Mat3 = [[number, number, number], [number, number, number], [number, number, number]]

const clamp = (x: number, a = -1, b = 1) => Math.max(a, Math.min(b, x))
const norm = (v: Vec3) => Math.hypot(v[0], v[1], v[2])
const normalize = (v: Vec3): Vec3 => {
  const n = norm(v) || 1
  return [v[0] / n, v[1] / n, v[2] / n]
}

export function latLonToUnit(lat: number, lon: number): Vec3 {
  const p = lat * Math.PI / 180
  const l = lon * Math.PI / 180
  return [Math.cos(p) * Math.cos(l), Math.sin(p), Math.cos(p) * Math.sin(l)]
}

function identity(): Mat3 { return [[1,0,0],[0,1,0],[0,0,1]] }
function clone(m: Mat3): Mat3 { return m.map(r => [...r]) as Mat3 }

function jacobiSymmetric(input: Mat3): { values: Vec3; vectors: Mat3 } {
  const a = clone(input)
  const v = identity()
  for (let iter = 0; iter < 40; iter++) {
    let p = 0, q = 1, max = Math.abs(a[0][1])
    for (const [i,j] of [[0,2],[1,2]] as const) {
      const x = Math.abs(a[i][j])
      if (x > max) { max = x; p = i; q = j }
    }
    if (max < 1e-18) break
    const phi = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p])
    const c = Math.cos(phi), s = Math.sin(phi)
    for (let k = 0; k < 3; k++) {
      const apk = a[p][k], aqk = a[q][k]
      a[p][k] = c * apk - s * aqk
      a[q][k] = s * apk + c * aqk
    }
    for (let k = 0; k < 3; k++) {
      const akp = a[k][p], akq = a[k][q]
      a[k][p] = c * akp - s * akq
      a[k][q] = s * akp + c * akq
    }
    for (let k = 0; k < 3; k++) {
      const vkp = v[k][p], vkq = v[k][q]
      v[k][p] = c * vkp - s * vkq
      v[k][q] = s * vkp + c * vkq
    }
  }
  return { values: [a[0][0], a[1][1], a[2][2]], vectors: v }
}

function inverse3(m: Mat3): Mat3 {
  const [a,b,c] = m[0], [d,e,f] = m[1], [g,h,i] = m[2]
  const A=e*i-f*h, B=-(d*i-f*g), C=d*h-e*g
  const D=-(b*i-c*h), E=a*i-c*g, F=-(a*h-b*g)
  const G=b*f-c*e, H=-(a*f-c*d), I=a*e-b*d
  const det=a*A+b*B+c*C
  if (Math.abs(det) < 1e-24) return identity()
  const s=1/det
  return [[A*s,D*s,G*s],[B*s,E*s,H*s],[C*s,F*s,I*s]]
}

function mulVec(m: Mat3, v: Vec3): Vec3 {
  return [m[0][0]*v[0]+m[0][1]*v[1]+m[0][2]*v[2], m[1][0]*v[0]+m[1][1]*v[1]+m[1][2]*v[2], m[2][0]*v[0]+m[2][1]*v[1]+m[2][2]*v[2]]
}

export function computePhysics(loads: Load[]): PhysicsResult {
  const c = EARTH.cbar
  const a = c - EARTH.j2
  // Renderer coordinates use +Y as geographic north, so the polar moment C belongs on Y.
  const inertia: Mat3 = [[a,0,0],[0,c,0],[0,0,a]]
  let netMassRatio = 0
  const cm: Vec3 = [0,0,0]
  let deltaC = 0

  for (const load of loads) {
    const s = load.sign ?? 1
    const mu = s * load.massKg / EARTH.mass
    const r = latLonToUnit(load.lat, load.lon)
    netMassRatio += mu
    cm[0] += mu*r[0]; cm[1] += mu*r[1]; cm[2] += mu*r[2]
    for (let i=0;i<3;i++) for (let j=0;j<3;j++) {
      inertia[i][j] += mu * ((i===j ? 1 : 0) - r[i]*r[j])
    }
    deltaC += mu * (1-r[1]*r[1])
  }

  const denom = 1 + netMassRatio
  const com: Vec3 = [cm[0]/denom, cm[1]/denom, cm[2]/denom]
  const com2 = com[0]**2 + com[1]**2 + com[2]**2
  for (let i=0;i<3;i++) for (let j=0;j<3;j++) {
    inertia[i][j] -= denom * ((i===j ? com2 : 0) - com[i]*com[j])
  }

  const eig = jacobiSymmetric(inertia)
  let idx = 0
  if (eig.values[1] > eig.values[idx]) idx=1
  if (eig.values[2] > eig.values[idx]) idx=2
  let figure: Vec3 = [eig.vectors[0][idx], eig.vectors[1][idx], eig.vectors[2][idx]]
  figure = normalize(figure)
  if (figure[1] < 0) figure = [-figure[0],-figure[1],-figure[2]]

  const figureTilt = Math.acos(clamp(figure[1]))
  const inv = inverse3(inertia)
  const spin = normalize(mulVec(inv, [0,c,0]))
  const spinTilt = Math.acos(clamp(spin[1]))
  const poleShiftM = figureTilt * EARTH.radius
  const spinPoleShiftM = spinTilt * EARTH.radius
  const centerOfMassShiftM = norm(com) * EARTH.radius
  const deltaLodSeconds = EARTH.siderealDay * deltaC / c
  const azimuthDeg = ((Math.atan2(figure[2], figure[0]) * 180/Math.PI) + 360) % 360

  return { figureAxis: figure, spinAxis: spin, figureTiltRad: figureTilt, spinTiltRad: spinTilt, poleShiftM, spinPoleShiftM, centerOfMassShiftM, deltaLodSeconds, azimuthDeg, massFraction: netMassRatio }
}

export function formatDistance(m: number) {
  const a=Math.abs(m)
  if (a < 1e-6) return `${(m*1e9).toFixed(2)} nm`
  if (a < 1e-3) return `${(m*1e6).toFixed(2)} µm`
  if (a < 1) return `${(m*1e3).toFixed(3)} mm`
  if (a < 1000) return `${m.toFixed(3)} m`
  return `${(m/1000).toFixed(3)} km`
}

export function formatTime(s: number) {
  const a=Math.abs(s)
  if (a < 1e-9) return `${(s*1e12).toFixed(2)} ps`
  if (a < 1e-6) return `${(s*1e9).toFixed(2)} ns`
  if (a < 1e-3) return `${(s*1e6).toFixed(3)} µs`
  if (a < 1) return `${(s*1e3).toFixed(3)} ms`
  return `${s.toFixed(4)} s`
}

export function formatMass(kg: number) {
  if (kg >= 1e12) return `${(kg/1e12).toFixed(2)} Gt`
  if (kg >= 1e9) return `${(kg/1e9).toFixed(2)} Mt`
  if (kg >= 1e6) return `${(kg/1e6).toFixed(2)} kt`
  return `${kg.toExponential(2)} kg`
}
