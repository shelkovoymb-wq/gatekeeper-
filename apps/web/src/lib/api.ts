import axios, { AxiosInstance } from 'axios'
import type { Channel, User, Stats, ApiResponse } from '@/types'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

const client: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const api = {
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
