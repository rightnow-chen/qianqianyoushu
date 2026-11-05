import '../config.mjs'
import { createMiniappUsageStore } from '../miniapp-usage-store.mjs'

// 单例：小程序额度与幂等记录存储。多个路由共用同一份连接与内存状态。
export const miniappUsageStore = createMiniappUsageStore({
  redisUrl: process.env.UPSTASH_REDIS_REST_URL,
  redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
})
