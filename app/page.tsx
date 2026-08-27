'use client'

import dynamic from 'next/dynamic'

const GlobeLab = dynamic(() => import('@/components/GlobeLab'), { ssr: false })

export default function Home() {
  return <GlobeLab />
}
