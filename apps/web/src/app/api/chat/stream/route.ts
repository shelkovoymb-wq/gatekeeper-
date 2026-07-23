import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  // Create ReadableStream for SSE with keep-alive
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      controller.enqueue(
        `data: ${JSON.stringify({
          id: 'connect',
          type: 'connection',
          message: 'Connected to chat stream',
        })}\n\n`
      )

      // Keep-alive: send heartbeat every 20 seconds
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(`: heartbeat\n\n`)
        } catch (e) {
          clearInterval(heartbeatInterval)
          try {
            controller.close()
          } catch (err) {
            // Stream already closed
          }
        }
      }, 20000)

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeatInterval)
        try {
          controller.close()
        } catch (err) {
          // Already closed
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
