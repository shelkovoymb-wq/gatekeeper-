import { Layout } from '@/components/Layout'

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <Layout>{children}</Layout>
}
