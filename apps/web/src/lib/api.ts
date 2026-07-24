import axios, { AxiosInstance } from 'axios'
import type { Channel, User, Stats, ApiResponse } from '@/types'

// По умолчанию бьёмся в собственные Next.js route handlers (/api/*),
// которые обслуживают админку. Можно переопределить через NEXT_PUBLIC_API_URL.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api'

const client: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const api = {
  // Дженерик-методы (возвращают распарсенное тело ответа).
  get: async <T = any>(url: string): Promise<T> => (await client.get<T>(url)).data,
  post: async <T = any>(url: string, body?: unknown): Promise<T> =>
    (await client.post<T>(url, body)).data,
  patch: async <T = any>(url: string, body?: unknown): Promise<T> =>
    (await client.patch<T>(url, body)).data,
  delete: async <T = any>(url: string): Promise<T> => (await client.delete<T>(url)).data,

  channels: {
    list: async (): Promise<Channel[]> => {
      const res = await client.get<ApiResponse<Channel[]>>('/channels')
      return res.data.data || []
    },
    create: async (data: Omit<Channel, 'id' | 'createdAt' | 'updatedAt'>): Promise<Channel> => {
      const res = await client.post<ApiResponse<Channel>>('/channels', data)
      return res.data.data!
    },
    update: async (id: string, data: Partial<Channel>): Promise<Channel> => {
      const res = await client.patch<ApiResponse<Channel>>(`/channels/${id}`, data)
      return res.data.data!
    },
    delete: async (id: string): Promise<void> => {
      await client.delete(`/channels/${id}`)
    },
  },

  users: {
    list: async (): Promise<User[]> => {
      const res = await client.get<ApiResponse<User[]>>('/users')
      return res.data.data || []
    },
    get: async (id: string): Promise<User> => {
      const res = await client.get<ApiResponse<User>>(`/users/${id}`)
      return res.data.data!
    },
    delete: async (id: string): Promise<void> => {
      await client.delete(`/users/${id}`)
    },
  },

  stats: {
    get: async (): Promise<Stats> => {
      const res = await client.get<ApiResponse<Stats>>('/stats')
      return res.data.data!
    },
  },
}
