import { PublicLayout } from '@/components/layout/PublicLayout'
import { AdSenseScript } from '@/components/layout/AdSenseScript'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicLayout>{children}</PublicLayout>
      <AdSenseScript />
    </>
  )
}
