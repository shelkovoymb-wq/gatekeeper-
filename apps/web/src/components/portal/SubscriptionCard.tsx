'use client'

interface SubscriptionCardProps {
  subscription: any
  isSelected: boolean
  onSelect: (id: string) => void
}

export function SubscriptionCard({ subscription, isSelected, onSelect }: SubscriptionCardProps) {
  return <div className="border rounded-lg p-4">Подписка: в разработке</div>
}
