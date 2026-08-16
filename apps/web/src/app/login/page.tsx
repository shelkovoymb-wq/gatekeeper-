import { Suspense } from 'react'
import { AuthForm } from '@/components/AuthForm'

export default function LoginPage() {
  // useSearchParams в AuthForm (возврат от OAuth: ?2fa=1, ?error=…) требует
  // границы Suspense — иначе Next не сможет отрендерить страницу статически.
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  )
}
