import { redirect } from 'next/navigation'

// Реквизиты переехали на общий экран «Приём денег» вместе с платёжными
// системами: для клиента это одно и то же — куда приходят деньги.
export default function LegacyPaymentAccountsPage() {
  redirect('/admin/payment-methods')
}
