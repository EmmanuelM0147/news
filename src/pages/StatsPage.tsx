import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

type NewsStats = {
  id: string
  title: string
  views: number
  likes: number
  dislikes: number
  comments: number
}

type RpcRow = {
  id: string
  title: string
  views: number | null
  likes: number | null
  dislikes: number | null
  comments: number | null
}

type FallbackRow = {
  id: string
  title: string
  views: Array<{ count: number }>
  likes: Array<{ is_like: boolean | null }>
  comments: Array<{ id: string }>
}

const normaliseRpc = (rows: RpcRow[] | null | undefined): NewsStats[] =>
  (rows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    views: row.views ?? 0,
    likes: row.likes ?? 0,
    dislikes: row.dislikes ?? 0,
    comments: row.comments ?? 0,
  }))

const normaliseFallback = (rows: FallbackRow[] | null | undefined): NewsStats[] =>
  (rows ?? []).map((row) => {
    const views = row.views?.[0]?.count ?? 0
    const likes = row.likes?.filter((item) => item.is_like === true).length ?? 0
    const dislikes = row.likes?.filter((item) => item.is_like === false).length ?? 0
    const comments = row.comments?.length ?? 0

    return {
      id: row.id,
      title: row.title,
      views,
      likes,
      dislikes,
      comments,
    }
  })

export function StatsPage() {
  const [stats, setStats] = useState<NewsStats[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStats = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_news_stats')

        if (rpcError) {
          // Fallback to client-side aggregation if RPC is unavailable
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('news')
            .select('id, title, views(count), likes(is_like), comments(id)')

          if (fallbackError) {
            throw fallbackError
          }

          setStats(normaliseFallback(fallbackData as FallbackRow[]))
        } else {
          setStats(normaliseRpc(rpcData as RpcRow[]))
        }
      } catch (fetchError) {
        const message =
          fetchError instanceof Error ? fetchError.message : 'Failed to fetch statistics.'
        setError(message)
        setStats([])
      } finally {
        setIsLoading(false)
      }
    }

    void fetchStats()
  }, [])

  return (
    <div className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 mb-0">News Stats</h1>
        <span className="text-body-secondary small">
          {isLoading ? 'Refreshing…' : `${stats.length} article${stats.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="d-flex justify-content-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading statistics…</span>
          </div>
        </div>
      ) : stats.length === 0 ? (
        <p className="text-muted">No news articles found.</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-striped align-middle">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col" className="text-center">
                  Views
                </th>
                <th scope="col" className="text-center">
                  Likes
                </th>
                <th scope="col" className="text-center">
                  Dislikes
                </th>
                <th scope="col" className="text-center">
                  Comments
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row) => (
                <tr key={row.id}>
                  <th scope="row" className="fw-semibold">
                    {row.title}
                  </th>
                  <td className="text-center">{row.views}</td>
                  <td className="text-center">{row.likes}</td>
                  <td className="text-center">{row.dislikes}</td>
                  <td className="text-center">{row.comments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default StatsPage

