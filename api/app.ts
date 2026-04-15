/**
 * This is a API server
 */

import cors from 'cors'
import dotenv from 'dotenv'
import express, {
  type Request,
  type Response
} from 'express'
import apiRoutes from './routes/api.js'
import { getEnv, getOptionalEnv } from './lib/env.js'

// load env
dotenv.config()

const app: express.Application = express()

const isProd = process.env.NODE_ENV === 'production'
const appPublicUrl = getOptionalEnv('APP_PUBLIC_URL')?.replace(/\/$/, '')
const allowedOrigins = new Set<string>()

if (isProd) {
  allowedOrigins.add(getEnv('APP_PUBLIC_URL').replace(/\/$/, ''))
} else {
  allowedOrigins.add('http://localhost:5173')
  allowedOrigins.add('http://127.0.0.1:5173')
  if (appPublicUrl) allowedOrigins.add(appPublicUrl)
}

const isAllowedOrigin = (origin: string) => allowedOrigins.has(origin)

app.use((req: Request, res: Response, next) => {
  const origin = req.header('origin')
  if (!origin || isAllowedOrigin(origin)) {
    next()
    return
  }
  res.status(403).json({ success: false, error: 'Origin not allowed' })
})

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true)
        return
      }
      callback(null, isAllowedOrigin(origin))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  }),
)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

/**
 * API Routes
 */
app.use('/api', apiRoutes)

/**
 * health
 */
app.use(
  '/api/health',
  (req: Request, res: Response): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response) => {
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
