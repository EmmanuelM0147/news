import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabaseClient'

type Tag = {
  name: string | null
}

type Picture = {
  url: string | null
}

type NewsComment = {
  id: string
  news_id: string
  user_name: string | null
  text: string | null
  created_at: string
}

type LikeRecord = {
  id: string
  news_id: string
  is_like: boolean | null
}

type ViewRecord = {
  news_id: string
  count: number | null
}

type NewsDetail = {
  id: string
  title: string
  text: string
  created_at: string
  tags: Tag[] | null
  pictures: Picture[] | null
}

function sortCommentsByDate(comments: NewsComment[]) {
  return [...comments].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
}

function coerceViewCount(views: ViewRecord | ViewRecord[] | null | undefined) {
  if (!views) {
    return 0
  }

  if (Array.isArray(views)) {
    return views[0]?.count ?? 0
  }

  return views.count ?? 0
}

export function NewsDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [newsItem, setNewsItem] = useState<NewsDetail | null>(null)
  const [comments, setComments] = useState<NewsComment[]>([])
  const [likesCount, setLikesCount] = useState(0)
  const [dislikesCount, setDislikesCount] = useState(0)
  const [viewCount, setViewCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [isLiking, setIsLiking] = useState(false)
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [commentForm, setCommentForm] = useState({ userName: '', text: '' })
  const hasIncrementedView = useRef(false)
  const fetchDetailsRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    hasIncrementedView.current = false
  }, [id])

  const fetchDetails = useCallback(async () => {
    if (!id) {
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('news')
      .select(
        `id,
        title,
        text,
        created_at,
        tags(name),
        pictures(url),
        comments(id, news_id, user_name, text, created_at),
        likes(id, news_id, is_like),
        views(count)`
      )
      .eq('id', id)
      .maybeSingle()

    if (fetchError) {
      setError(fetchError.message)
      setLoading(false)
      return
    }

    if (!data) {
      setError('News article not found.')
      setLoading(false)
      return
    }

    setNewsItem({
      id: data.id,
      title: data.title,
      text: data.text,
      created_at: data.created_at,
      tags: data.tags ?? [],
      pictures: data.pictures ?? [],
    })

    const commentRecords = (data.comments ?? []) as NewsComment[]
    setComments(sortCommentsByDate(commentRecords))

    const likeRecords = (data.likes ?? []) as LikeRecord[]
    const initialLikes = likeRecords.filter((like) => like.is_like).length
    const initialDislikes = likeRecords.filter((like) => like.is_like === false).length
    setLikesCount(initialLikes)
    setDislikesCount(initialDislikes)

    const initialViews = coerceViewCount(data.views as ViewRecord | ViewRecord[] | null)
    setViewCount(initialViews)

    setLoading(false)
  }, [id])

  useEffect(() => {
    fetchDetails()
  }, [fetchDetails])

  useEffect(() => {
    if (!id || loading || hasIncrementedView.current) {
      return
    }

    hasIncrementedView.current = true

    const incrementView = async () => {
      const nextCount = viewCount + 1
      const { data, error: viewError } = await supabase
        .from('views')
        .upsert({ news_id: id, count: nextCount }, { onConflict: 'news_id' })
        .select('count')
        .maybeSingle()

      if (viewError) {
        console.error('Failed to increment view count', viewError)
        return
      }

      if (data?.count != null) {
        setViewCount(data.count)
      } else {
        setViewCount(nextCount)
      }
    }

    void incrementView()
  }, [id, loading, viewCount])

  const handleLikeChange = useCallback(
    (payload: RealtimePostgresChangesPayload<LikeRecord>) => {
      const newLike = payload.new
      const oldLike = payload.old
      const targetId = newLike?.news_id ?? oldLike?.news_id

      if (!targetId || targetId !== id) {
        return
      }

      if (payload.eventType === 'INSERT' && newLike) {
        if (newLike.is_like) {
          setLikesCount((prev) => prev + 1)
        } else {
          setDislikesCount((prev) => prev + 1)
        }
      } else if (payload.eventType === 'DELETE' && oldLike) {
        if (oldLike.is_like) {
          setLikesCount((prev) => Math.max(prev - 1, 0))
        } else {
          setDislikesCount((prev) => Math.max(prev - 1, 0))
        }
      } else if (payload.eventType === 'UPDATE' && newLike && oldLike) {
        if (oldLike.is_like === newLike.is_like) {
          return
        }

        if (newLike.is_like) {
          setLikesCount((prev) => prev + 1)
          setDislikesCount((prev) => Math.max(prev - 1, 0))
        } else {
          setDislikesCount((prev) => prev + 1)
          setLikesCount((prev) => Math.max(prev - 1, 0))
        }
      } else if (payload.eventType === 'TRUNCATE') {
        void fetchDetails()
      }
    },
    [id, fetchDetails],
  )

  const handleCommentChange = useCallback(
    (payload: RealtimePostgresChangesPayload<NewsComment>) => {
      const newComment = payload.new
      const oldComment = payload.old
      const targetId = newComment?.news_id ?? oldComment?.news_id

      if (!targetId || targetId !== id) {
        return
      }

      if (payload.eventType === 'INSERT' && newComment) {
        setComments((prev) => sortCommentsByDate([...prev.filter((c) => c.id !== newComment.id), newComment]))
      } else if (payload.eventType === 'UPDATE' && newComment) {
        setComments((prev) => sortCommentsByDate([...prev.filter((c) => c.id !== newComment.id), newComment]))
      } else if (payload.eventType === 'DELETE' && oldComment) {
        setComments((prev) => prev.filter((c) => c.id !== oldComment.id))
      } else if (payload.eventType === 'TRUNCATE') {
        setComments([])
      }
    },
    [id],
  )

  const handleViewChange = useCallback(
    (payload: RealtimePostgresChangesPayload<ViewRecord>) => {
      const newView = payload.new
      const oldView = payload.old
      const targetId = newView?.news_id ?? oldView?.news_id

      if (!targetId || targetId !== id) {
        return
      }

      if (payload.eventType === 'TRUNCATE') {
        setViewCount(0)
        return
      }

      if (newView?.count != null) {
        setViewCount(newView.count)
      }
    },
    [id],
  )

  useEffect(() => {
    if (!id) {
      return
    }

    const channel = supabase
      .channel('news-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, handleLikeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, handleCommentChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'views' }, handleViewChange)
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [id, handleLikeChange, handleCommentChange, handleViewChange])

  const handleCommentInput = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target
    setCommentForm((prev) => ({ ...prev, [name]: value }))
  }

  const generateUserId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `guest-${crypto.randomUUID()}`
    }

    return `guest-${Date.now()}`
  }

  const handleLikeAction = async (isLike: boolean) => {
    if (!id) {
      return
    }

    setIsLiking(true)
    setError(null)

    const { error: likeError } = await supabase.from('likes').insert({
      news_id: id,
      is_like: isLike,
      user_id: generateUserId(),
    })

    if (likeError) {
      setError(likeError.message)
    }

    setIsLiking(false)
  }

  const handleCommentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!id) {
      return
    }

    if (!commentForm.userName.trim() || !commentForm.text.trim()) {
      setCommentError('Please enter your name and comment.')
      return
    }

    setCommentError(null)
    setIsSubmittingComment(true)

    const { error: submitError } = await supabase.from('comments').insert({
      news_id: id,
      user_name: commentForm.userName.trim(),
      text: commentForm.text.trim(),
    })

    if (submitError) {
      setCommentError(submitError.message)
    } else {
      setCommentForm({ userName: '', text: '' })
    }

    setIsSubmittingComment(false)
  }

  if (!id) {
    return (
      <div className="py-4">
        <div className="alert alert-danger" role="alert">
          Invalid news identifier.
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="py-5 d-flex justify-content-center">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading…</span>
        </div>
      </div>
    )
  }

  if (error && !newsItem) {
    return (
      <div className="py-4">
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      </div>
    )
  }

  if (!newsItem) {
    return null
  }

  const tags = newsItem.tags ?? []
  const pictures = newsItem.pictures ?? []

  return (
    <div className="py-4">
      {error ? (
        <div className="alert alert-warning" role="alert">
          {error}
        </div>
      ) : null}

      <header className="mb-4">
        <h1 className="mb-3">{newsItem.title}</h1>
        <div className="d-flex flex-wrap gap-3 text-body-secondary">
          <span>{new Date(newsItem.created_at).toLocaleString()}</span>
          <span>{viewCount} views</span>
          <div className="d-flex align-items-center gap-3">
            <button
              type="button"
              className="btn btn-outline-success btn-sm d-flex align-items-center gap-2"
              onClick={() => void handleLikeAction(true)}
              disabled={isLiking}
            >
              <span aria-hidden="true">👍</span>
              <span>Like ({likesCount})</span>
            </button>
            <button
              type="button"
              className="btn btn-outline-danger btn-sm d-flex align-items-center gap-2"
              onClick={() => void handleLikeAction(false)}
              disabled={isLiking}
            >
              <span aria-hidden="true">👎</span>
              <span>Dislike ({dislikesCount})</span>
            </button>
          </div>
        </div>
        {tags.length > 0 ? (
          <div className="d-flex flex-wrap gap-2 mt-3">
            {tags.map((tag) =>
              tag.name ? (
                <span key={tag.name} className="badge bg-secondary-subtle text-secondary-emphasis">
                  {tag.name}
                </span>
              ) : null
            )}
          </div>
        ) : null}
      </header>

      {pictures.length > 0 ? (
        <div className="row g-3 mb-4">
          {pictures.map((picture, index) =>
            picture.url ? (
              <div className="col-12 col-md-6" key={`${picture.url}-${index}`}>
                <img
                  src={picture.url}
                  alt={newsItem.title}
                  className="img-fluid rounded"
                  style={{ objectFit: 'cover', width: '100%', maxHeight: '320px' }}
                />
              </div>
            ) : null
          )}
        </div>
      ) : null}

      <article className="mb-5">
        {newsItem.text
          .split(/\n+/)
          .filter(Boolean)
          .map((paragraph, idx) => (
            <p key={idx} className="fs-5 lh-lg">
              {paragraph}
            </p>
          ))}
      </article>

      <section className="mb-5">
        <h2 className="h4 mb-3">Comments ({comments.length})</h2>
        {comments.length === 0 ? (
          <p className="text-muted mb-3">No comments yet. Be the first to share your thoughts.</p>
        ) : (
          <div className="list-group">
            {comments.map((comment) => (
              <div className="list-group-item" key={comment.id}>
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <strong>{comment.user_name ?? 'Anonymous'}</strong>
                  <span className="text-body-secondary small">
                    {new Date(comment.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mb-0">{comment.text ?? ''}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Add a comment">
        <h3 className="h5 mb-3">Leave a comment</h3>
        {commentError ? (
          <div className="alert alert-warning" role="alert">
            {commentError}
          </div>
        ) : null}
        <form className="row g-3" onSubmit={handleCommentSubmit}>
          <div className="col-12 col-md-4">
            <label htmlFor="comment-name" className="form-label">
              Your name
            </label>
            <input
              id="comment-name"
              name="userName"
              type="text"
              className="form-control"
              value={commentForm.userName}
              onChange={handleCommentInput}
              placeholder="Jane Doe"
              autoComplete="name"
              disabled={isSubmittingComment}
              required
            />
          </div>
          <div className="col-12">
            <label htmlFor="comment-text" className="form-label">
              Comment
            </label>
            <textarea
              id="comment-text"
              name="text"
              className="form-control"
              rows={4}
              value={commentForm.text}
              onChange={handleCommentInput}
              placeholder="Share your thoughts..."
              disabled={isSubmittingComment}
              required
            />
          </div>
          <div className="col-12">
            <button type="submit" className="btn btn-primary" disabled={isSubmittingComment}>
              {isSubmittingComment ? 'Posting…' : 'Post Comment'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default NewsDetailPage

