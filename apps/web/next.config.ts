import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))

const config: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(dir, '../../'),
}

export default config
