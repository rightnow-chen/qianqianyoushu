import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { allowedOrigins, distDir, indexHtmlPath, port } from './config.mjs'
import { registerAiRoutes } from './routes/ai.mjs'
import { registerAuthRoutes } from './routes/auth.mjs'
import { registerContractRoutes } from './routes/contract.mjs'
import { registerHealthRoutes } from './routes/health.mjs'
import { registerMiniappAiRoutes } from './routes/miniapp-ai.mjs'
import { registerOcrRoutes } from './routes/ocr.mjs'
import { registerRagRoutes } from './routes/rag.mjs'
import { registerSubsidyRoutes } from './routes/subsidy.mjs'

// 向后兼容：脚本历史上直接从网关模块导入 OCR 能力，统一转发到服务层。
export {
  detectImageSignature,
  recognizeImageOffline,
  recognizeImageWithRapidOcr,
  recognizeImageWithFallback,
  recognizeImageWithZhipuVision,
} from './services/ocr.mjs'

const app = express()

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true)
      return
    }
    callback(new Error('CORS origin is not allowed'))
  },
}))
app.use(express.json({ limit: '12mb' }))

registerHealthRoutes(app)
registerSubsidyRoutes(app)
registerAuthRoutes(app)
registerMiniappAiRoutes(app)
registerRagRoutes(app)
registerOcrRoutes(app)
registerContractRoutes(app)
registerAiRoutes(app)

app.use((error, _request, response, next) => {
  if (error instanceof multer.MulterError) {
    response.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
      message: error.code === 'LIMIT_FILE_SIZE' ? '文件超过 8MB 上传限制' : error.message,
    })
    return
  }

  next(error)
})

if (existsSync(indexHtmlPath)) {
  app.use(express.static(distDir))
  app.get(/^\/(?!api(?:\/|$)).*/, (_request, response) => {
    response.sendFile(indexHtmlPath)
  })
} else {
  app.get('/', (_request, response) => {
    response.status(404).send('Frontend build not found. Run `npm run build` before `npm start`.')
  })
}

const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (isMainModule) {
  // Keep an explicit reference to the listener. Some Windows/npm launch
  // environments otherwise let the server be collected after startup.
  const server = app.listen(port, () => {
    console.log(`Zu Xiao Shen AI proxy listening on http://localhost:${port}`)
  })
  server.on('error', (error) => {
    console.error(`AI proxy failed to listen on port ${port}: ${error.message}`)
    process.exitCode = 1
  })
}
