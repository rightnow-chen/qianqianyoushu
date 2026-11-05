import { getSubsidyPolicyFeed, getSubsidyRefreshConfig, listSubsidyCities } from '../subsidy-policy-service.mjs'
import { rateLimit } from '../lib/guards.mjs'

export function registerSubsidyRoutes(app) {
  app.get('/api/subsidy/policies', rateLimit('subsidy-policies', 30), async (request, response) => {
    const city = String(request.query.city || '').trim()
    if (!city || !listSubsidyCities().includes(city)) {
      response.set('Cache-Control', 'private, max-age=300')
      response.json({ generatedAt: new Date().toISOString(), ...getSubsidyRefreshConfig(), policies: [], warning: 'city-not-collected' })
      return
    }
    response.set('Cache-Control', 'private, max-age=300')
    try {
      response.json(await getSubsidyPolicyFeed(city))
    } catch {
      response.json({ generatedAt: new Date().toISOString(), ...getSubsidyRefreshConfig(), policies: [], warning: 'live-review-unavailable' })
    }
  })
}
