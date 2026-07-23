import { create } from 'zustand'
import type { Channel, User, Stats } from '@/types'

interface AdminStore {
  channels: Channel[]
  users: User[]
  stats: Stats | null
  isLoading: boolean
  error: string | null

  setChannels: (channels: Channel[]) => void
  setUsers: (users: User[]) => void
  setStats: (stats: Stats) => void
  setIsLoading: (loading: boolean) => void
  setError: (error: string | null) => void

  addChannel: (channel: Channel) => void
  removeChannel: (id: string) => void
  updateChannel: (id: string, updates: Partial<Channel>) => void

  addUser: (user: User) => void
  removeUser: (id: string) => void
}

export const useAdminStore = create<AdminStore>((set) => ({
  channels: [],
  users: [],
  stats: null,
  isLoading: false,
  error: null,

  setChannels: (channels) => set({ channels }),
  setUsers: (users) => set({ users }),
  setStats: (stats) => set({ stats }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  addChannel: (channel) =>
    set((state) => ({
      channels: [...state.channels, channel],
    })),

  removeChannel: (id) =>
    set((state) => ({
      channels: state.channels.filter((c) => c.id !== id),
    })),

  updateChannel: (id, updates) =>
    set((state) => ({
      channels: state.channels.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),

  addUser: (user) =>
    set((state) => ({
      users: [...state.users, user],
    })),

  removeUser: (id) =>
    set((state) => ({
      users: state.users.filter((u) => u.id !== id),
    })),
}))
