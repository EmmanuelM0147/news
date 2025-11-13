import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.3/mod.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const databaseUrl =
  Deno.env.get('SUPABASE_DB_URL') ??
  Deno.env.get('DATABASE_URL') ??
  (() => {
    throw new Error('Missing SUPABASE_DB_URL environment variable.')
  })()

const sql = postgres(databaseUrl, { prepare: false })

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let payload: unknown

  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const newsId = typeof (payload as { newsId?: unknown }).newsId === 'string' ? (payload as { newsId: string }).newsId.trim() : ''

  if (!newsId) {
    return new Response(JSON.stringify({ error: 'newsId is required.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const [row] =
      (await sql/* sql */`
        insert into views (news_id, count)
        values (${newsId}, 1)
        on conflict (news_id)
        do update set count = views.count + 1
        returning count
      `) ?? []

    if (!row) {
      throw new Error('Failed to increment view count.')
    }

    return new Response(JSON.stringify({ newsId, views: row.count }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('increment_view error:', error)

    return new Response(
      JSON.stringify({
        error: 'Unable to increment view count.',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})

