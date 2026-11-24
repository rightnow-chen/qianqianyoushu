// 腾讯云 CloudBase HTTP 云函数入口（Express 版）。
// CloudBase 的 HTTP 访问服务把 /api/* 映射到本函数，网关转发时可能保留也可能
// 剥离 /api 前缀（取决于控制台配置）。下面的兜底中间件兼容两种情况：
//   - 网关传 /api/ai/chat → 原样交给 Express
//   - 网关传 /ai/chat      → 补成 /api/ai/chat 再交给 Express
// 这样Express 里注册的 /api/* 路由在两种配置下都能命中。
import express from 'express'
import app from './server/ai-proxy.mjs'

const bootstrap = express()

bootstrap.use((req, _res, next) => {
  const url = req.url || '/'
  if (url !== '/api' && !url.startsWith('/api/')) {
    req.url = '/api' + (url === '/' ? '' : url)
  }
  next()
})

// 挂载在根路径：内层 app 看到的 req.url 就是上面补好的完整路径。
bootstrap.use(app)

const port = Number(process.env.PORT || 9000)
bootstrap.listen(port, '0.0.0.0', () => {
  console.log(`[cloudbase] API function listening on 0.0.0.0:${port}`)
})
