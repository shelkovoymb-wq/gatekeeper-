import { Layout } from '@/components/Layout'

export default function OwnerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <Layout>{children}</Layout>
}
