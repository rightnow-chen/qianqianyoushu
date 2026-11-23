// Vercel catch-all Serverless Function：把 /api/* 的所有请求交给 Express app。
// 关键：Vercel 保留浏览器原始 URL（/api/ai/chat），Express 里注册的
// /api/ai/chat、/api/rag/search 等路由因此能正常匹配。
// 不要用 vercel.json 的 rewrites 转发到函数——rewrite 会改写 req.url，
// 导致 Express 路由全部 404。
import app from '../server/ai-proxy.mjs'

export default app
