import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

type ViewsAggregate = { count: number | null } | null
type CommentsAggregate = { count: number | null } | null

type NewsStatsRow = {
  id: string
  title: string | null
  views: ViewsAggregate[] | null
  likes: { id: string; is_like: boolean | null }[] | null
  comments: CommentsAggregate[] | null
}

type NewsStats = {
  id: string
  title: string
  views: number
  likes: number
  dislikes: number
  comments: number
}

const numberFormatter = new Intl.NumberFormat()

export function StatsPage() {
  const [stats, setStats] = useState<NewsStats[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isMountedRef = useRef(true)

  const loadStats = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('news')
      .select(
        `
          id,
          title,
          views(count),
          likes(id, is_like),
          comments(count)
        `,
      )
      .order('title', { ascending: true })

    if (!isMountedRef.current) {
      return
    }

    if (fetchError) {
      setError(fetchError.message)
      setStats([])
      setIsLoading(false)
      return
    }

    const formatted: NewsStats[] =
      data?.map((item: NewsStatsRow) => {
        const viewsCount = item.views?.[0]?.count ?? 0
        const likes = item.likes ?? []
        const likesCount = likes.filter((like) => like.is_like === true).length
        const dislikesCount = likes.filter((like) => like.is_like === false).length
        const commentsCount = item.comments?.[0]?.count ?? 0

        return {
          id: item.id,
          title: item.title ?? 'Untitled',
          views: viewsCount,
          likes: likesCount,
          dislikes: dislikesCount,
          comments: commentsCount,
        }
      }) ?? []

    setStats(formatted)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    void loadStats()

    return () => {
      isMountedRef.current = false
    }
  }, [loadStats])

  return (
    <div className="py-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h1 className="mb-1">Stats</h1>
          <p className="text-muted mb-0">Overview of engagement per news item.</p>
        </div>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={() => {
            void loadStats()
          }}
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      <div className="table-responsive">
        <table className="table table-hover align-middle">
          <thead className="table-light">
            <tr>
              <th scope="col">Title</th>
              <th scope="col" className="text-end">
                Views
              </th>
              <th scope="col" className="text-end">
                Likes
              </th>
              <th scope="col" className="text-end">
                Dislikes
              </th>
              <th scope="col" className="text-end">
                Comments
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="text-center py-4">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading…</span>
                  </div>
                </td>
              </tr>
            ) : stats.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-4 text-muted">
                  No stats available yet.
                </td>
              </tr>
            ) : (
              stats.map((item) => (
                <tr key={item.id}>
                  <td className="fw-medium">{item.title}</td>
                  <td className="text-end">{numberFormatter.format(item.views)}</td>
                  <td className="text-end text-success fw-semibold">
                    {numberFormatter.format(item.likes)}
                  </td>
                  <td className="text-end text-danger fw-semibold">
                    {numberFormatter.format(item.dislikes)}
                  </td>
                  <td className="text-end">{numberFormatter.format(item.comments)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default StatsPage
