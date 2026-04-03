import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { completionsRouter } from './routes/completions'

const app = new Hono()

app.use('*', logger())
app.use(
  '*',
  cors({
    origin: ['http://localhost:5174', 'http://127.0.0.1:5174', 'http://localhost:5173'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
)

app.route('/api/completions', completionsRouter)

app.get('/api/health', (c) => c.json({ ok: true }))

const port = Number(process.env.PORT ?? 3002)

serve({ fetch: app.fetch, port }, () => {
  console.log(`\x1b[32m✓\x1b[0m Prompt Lab API running on http://localhost:${port}`)
})
