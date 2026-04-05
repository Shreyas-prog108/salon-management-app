'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiService } from '@/services/api'
import Layout from '@/components/common/Layout'

export default function StylistLayout({ children }) {
  const router = useRouter()

  useEffect(() => {
    const user = apiService.user
    if (!user) {
      router.replace('/auth/login')
    } else if (user.role !== 'stylist') {
      router.replace('/auth/login')
    }
  }, [router])

  return <Layout>{children}</Layout>
}
