import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(dir, '../../'),
}

export default config
