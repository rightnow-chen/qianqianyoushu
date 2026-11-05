import { aiEvalCases } from '../data/ai-eval-cases.mjs'
import { evaluateKnowledgeRetrieval, searchKnowledge } from '../rag-engine.mjs'
import { rateLimit, trustedApiRequest } from '../lib/guards.mjs'

function sendRagSearchResponse(response, { query, limit }) {
  const normalizedQuery = String(query || '').slice(0, 4_000)
  const items = searchKnowledge(normalizedQuery, limit)

  response.json({
    ok: true,
    mode: 'local-hybrid-rag',
    query: normalizedQuery,
    total: items.length,
    items,
  })
}

export function registerRagRoutes(app) {
  app.get('/api/rag/search', trustedApiRequest, rateLimit('rag', 60), (request, response) => {
    sendRagSearchResponse(response, {
      query: String(request.query.q || ''),
      limit: Number(request.query.limit || 5),
    })
  })

  app.post('/api/rag/search', trustedApiRequest, rateLimit('rag', 60), (request, response) => {
    sendRagSearchResponse(response, {
      query: String(request.body?.query || request.body?.q || ''),
      limit: Number(request.body?.limit || 5),
    })
  })

  app.get('/api/rag/evaluate', trustedApiRequest, rateLimit('rag-evaluate', 10), (request, response) => {
    const limit = Number(request.query.limit || 5)
    const results = evaluateKnowledgeRetrieval(aiEvalCases, limit)
    const passed = results.filter((item) => item.passed).length

    response.json({
      ok: passed === results.length,
      mode: 'local-hybrid-rag',
      total: results.length,
      passed,
      failed: results.length - passed,
      results,
    })
  })
}
