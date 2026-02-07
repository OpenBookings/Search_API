import './config/env.ts'
import type { z } from 'zod'
import Fastify from 'fastify'
import { dbPlugin } from './plugins/db.plugin.ts'
import { search } from './modules/search.controller.ts'
import { SearchQuerySchema } from './modules/search.validator.ts'

const fastify = Fastify({
  logger: true
})

await fastify.register(dbPlugin)

fastify.get('/health', function (_, reply) {
  reply.send({ status: 'ok' })
})

fastify.get('/search', async function (request, reply) {
  // Pass raw query; Zod is the single source of validation and defaults.
  const result = await search(request.query as z.input<typeof SearchQuerySchema>);

  if ("status" in result && result.status === 400) {
    return reply.status(400).send({ error: result.error });
  }
  return reply.send(result);
})

fastify.listen({ port: 3000 }, function (err) {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})