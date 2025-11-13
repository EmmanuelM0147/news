import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabaseClient'
import { getAvatarUrlFromName, getUserAvatarUrl, getUserDisplayName } from '../utils/userProfile'

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
  user_id: string | null
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

type Reaction = 'like' | 'dislike'

const sortCommentsByDate = (comments: NewsComment[]) =>
  [...comments].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )

const coerceViewCount = (views: ViewRecord | ViewRecord[] | null | undefined) => {
  if (!views) {
    return 0
  }

  if (Array.isArray(views)) {
    return views[0]?.count ?? 0
  }

  return views.count ?? 0
}

const NewsDetailSkeleton = () => (
  <div className="py-4">
    <div className="placeholder-glow mb-4">
      <span className="placeholder col-8 display-5" />
      <span className="placeholder col-3" />
    </div>
    <div className="placeholder-glow mb-4">
      <span className="placeholder col-2" />
      <span className="placeholder col-1 ms-2" />
    </div>
    <div className="row row-cols-1 row-cols-md-2 g-3 mb-5">
      {[0, 1, 2, 3].map((idx) => (
        <div className="col" key={idx}>
          <div className="ratio ratio-16x9 bg-body-secondary rounded placeholder" />
        </div>
      ))}
    </div>
    <div className="placeholder-glow">
      {[0, 1, 2].map((idx) => (
        <p key={idx} className="placeholder col-12" />
      ))}
    </div>
    <div className="mt-5">
      <h2 className="h4 mb-3">Comments</h2>
      {[0, 1, 2].map((idx) => (
        <div className="list-group-item py-3 placeholder-glow" key={idx}>
          <div className="d-flex gap-3 align-items-center">
            <span className="placeholder rounded-circle" style={{ width: '48px', height: '48px' }} />
            <div className="flex-grow-1">
              <span className="placeholder col-4 mb-2" />
              <span className="placeholder col-7" />
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
)

export function NewsDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, isLoading: authLoading } = useAuth()
  const userId = user?.id ?? null

  const [newsItem, setNewsItem] = useState<NewsDetail | null>(null)
  const [comments, setComments] = useState<NewsComment[]>([])
  const [likesCount, setLikesCount] = useState(0)
  const [dislikesCount, setDislikesCount] = useState(0)
  const [viewCount, setViewCount] = useState(0)
  const [userReaction, setUserReaction] = useState<Reaction | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [isLiking, setIsLiking] = useState(false)
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [isAwaitingCommentAck, setIsAwaitingCommentAck] = useState(false)
  const [pendingCommentId, setPendingCommentId] = useState<string | null>(null)
  const [commentText, setCommentText] = useState('')
  const [guestName, setGuestName] = useState('')
  const hasIncrementedView = useRef(false)
  const fetchDetailsRef = useRef<(() => Promise<void>) | null>(null)
  const userDisplayName = useMemo(() => getUserDisplayName(user), [user])
  const userAvatarUrl = useMemo(() => getUserAvatarUrl(user), [user])

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
        likes(id, news_id, user_id, is_like),
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
    setLikesCount(likeRecords.filter((like) => like.is_like).length)
    setDislikesCount(likeRecords.filter((like) => like.is_like === false).length)

    const userLike = userId ? likeRecords.find((like) => like.user_id === userId) : undefined
    setUserReaction(userLike ? (userLike.is_like ? 'like' : 'dislike') : null)

    const initialViews = coerceViewCount(data.views as ViewRecord | ViewRecord[] | null)
    setViewCount(initialViews)

    setLoading(false)
  }, [id, userId])

  useEffect(() => {
    fetchDetailsRef.current = fetchDetails
  }, [fetchDetails])

  useEffect(() => {
    if (!id) {
      return
    }

    fetchDetailsRef.current?.()
  }, [id, userId])

  const incrementViewCount = useCallback(async () => {
    if (!id) {
      return
    }

    try {
      const { data, error } = await supabase.functions.invoke<{ newsId: string; views?: number }>(
        'increment_view',
        {
          body: { newsId: id },
        },
      )

      if (error) {
        console.error('Failed to invoke increment_view function', error)
        return
      }

      if (data?.views != null) {
        setViewCount(data.views)
      } else {
        setViewCount((prev) => prev + 1)
      }
    } catch (err) {
      console.error('Unexpected error while incrementing view count', err)
    }
  }, [id])

  useEffect(() => {
    if (!id || loading || hasIncrementedView.current) {
      return
    }

    hasIncrementedView.current = true
    void incrementViewCount()
  }, [id, loading, incrementViewCount])

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

        if (userId && newLike.user_id === userId) {
          setUserReaction(newLike.is_like ? 'like' : 'dislike')
        }
      } else if (payload.eventType === 'DELETE' && oldLike) {
        if (oldLike.is_like) {
          setLikesCount((prev) => Math.max(prev - 1, 0))
        } else {
          setDislikesCount((prev) => Math.max(prev - 1, 0))
        }

        if (userId && oldLike.user_id === userId) {
          setUserReaction(null)
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

        if (userId && newLike.user_id === userId) {
          setUserReaction(newLike.is_like ? 'like' : 'dislike')
        }
      } else if (payload.eventType === 'TRUNCATE') {
        setLikesCount(0)
        setDislikesCount(0)
        setUserReaction(null)
        void fetchDetailsRef.current?.()
      }
    },
    [id, userId],
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
        setComments((prev) =>
          sortCommentsByDate([...prev.filter((c) => c.id !== newComment.id), newComment]),
        )
        if (pendingCommentId && newComment.id === pendingCommentId) {
          setIsAwaitingCommentAck(false)
          setPendingCommentId(null)
        }
      } else if (payload.eventType === 'UPDATE' && newComment) {
        setComments((prev) =>
          sortCommentsByDate([...prev.filter((c) => c.id !== newComment.id), newComment]),
        )
      } else if (payload.eventType === 'DELETE' && oldComment) {
        setComments((prev) => prev.filter((c) => c.id !== oldComment.id))
      } else if (payload.eventType === 'TRUNCATE') {
        setComments([])
        setPendingCommentId(null)
        setIsAwaitingCommentAck(false)
      }
    },
    [id, pendingCommentId],
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
    if (name === 'userName') {
      setGuestName(value)
    } else if (name === 'text') {
      setCommentText(value)
    }
  }

  const handleLikeAction = async (isLike: boolean) => {
    if (!id) {
      return
    }

    if (!userId) {
      setError('Please sign in to react to this article.')
      return
    }

    setIsLiking(true)
    setError(null)

    const { data: existing, error: fetchLikeError } = await supabase
      .from('likes')
      .select('id, is_like')
      .eq('news_id', id)
      .eq('user_id', userId)
      .maybeSingle()

    if (fetchLikeError) {
      setError(fetchLikeError.message)
      setIsLiking(false)
      return
    }

    if (existing) {
      if (existing.is_like === isLike) {
        const { error: deleteError } = await supabase.from('likes').delete().eq('id', existing.id)
        if (deleteError) {
          setError(deleteError.message)
        } else {
          setUserReaction(null)
        }
        setIsLiking(false)
        return
      }

      const { error: updateError } = await supabase
        .from('likes')
        .update({ is_like: isLike })
        .eq('id', existing.id)

      if (updateError) {
        setError(updateError.message)
        setIsLiking(false)
        return
      }
    } else {
      const { error: insertError } = await supabase.from('likes').insert({
        news_id: id,
        user_id: userId,
        is_like: isLike,
      })

      if (insertError) {
        setError(insertError.message)
        setIsLiking(false)
        return
      }
    }

    setUserReaction(isLike ? 'like' : 'dislike')
    setIsLiking(false)
  }

  const handleCommentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!id) {
      return
    }

    const resolvedName = user ? userDisplayName : guestName.trim()
    const trimmedText = commentText.trim()

    if (!resolvedName) {
      setCommentError('Please provide your name to comment.')
      return
    }

    if (!trimmedText) {
      setCommentError('Please enter a comment before submitting.')
      return
    }

    setCommentError(null)
    setIsSubmittingComment(true)
    setIsAwaitingCommentAck(true)

    const { data: inserted, error: submitError } = await supabase
      .from('comments')
      .insert({
        news_id: id,
        user_name: resolvedName,
        text: trimmedText,
      })
      .select('id, news_id, user_name, text, created_at')
      .single()

    if (submitError) {
      setCommentError(submitError.message)
      setIsAwaitingCommentAck(false)
      setPendingCommentId(null)
    } else if (inserted) {
      setPendingCommentId(inserted.id)
      setComments((prev) => sortCommentsByDate([...prev.filter((c) => c.id !== inserted.id), inserted]))
      if (user) {
        setCommentText('')
      } else {
        setGuestName('')
        setCommentText('')
      }
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

  if (loading && !newsItem) {
    return <NewsDetailSkeleton />
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
  const likeButtonClass = [
    'btn',
    'btn-sm',
    'd-flex',
    'align-items-center',
    'gap-2',
    userReaction === 'like' ? 'btn-success' : 'btn-outline-success',
  ].join(' ')
  const dislikeButtonClass = [
    'btn',
    'btn-sm',
    'd-flex',
    'align-items-center',
    'gap-2',
    userReaction === 'dislike' ? 'btn-danger' : 'btn-outline-danger',
  ].join(' ')

  const commentActionDisabled = isSubmittingComment || isAwaitingCommentAck
  const commentButtonLabel = isAwaitingCommentAck ? 'Syncing…' : isSubmittingComment ? 'Posting…' : 'Post Comment'

  return (
    <div className="py-4">
      {error ? (
        <div className="alert alert-warning" role="alert">
          {error}
        </div>
      ) : null}

      <header className="mb-4">
        <h1 className="mb-3">{newsItem.title}</h1>
        <div className="d-flex flex-wrap gap-3 text-body-secondary align-items-center">
          <span>{new Date(newsItem.created_at).toLocaleString()}</span>
          <span>{viewCount} views</span>
          <div className="d-flex align-items-center gap-3">
            <button
              type="button"
              className={likeButtonClass}
              onClick={() => void handleLikeAction(true)}
              disabled={isLiking || authLoading}
            >
              <span aria-hidden="true">👍</span>
              <span>Like ({likesCount})</span>
            </button>
            <button
              type="button"
              className={dislikeButtonClass}
              onClick={() => void handleLikeAction(false)}
              disabled={isLiking || authLoading}
            >
              <span aria-hidden="true">👎</span>
              <span>Dislike ({dislikesCount})</span>
            </button>
          </div>
          {userReaction ? (
            <span className="badge text-bg-light border">
              You {userReaction === 'like' ? 'like' : 'dislike'} this
            </span>
          ) : null}
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
        <div className="row row-cols-1 row-cols-md-2 g-3 mb-4">
          {pictures.map((picture, index) =>
            picture.url ? (
              <div className="col" key={`${picture.url}-${index}`}>
                <img
                  src={picture.url}
                  alt={newsItem.title}
                  className="img-fluid rounded shadow-sm news-gallery-img"
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
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h2 className="h4 mb-0">Comments ({comments.length})</h2>
          {isAwaitingCommentAck ? <span className="text-muted small">Waiting for confirmation…</span> : null}
        </div>
        {comments.length === 0 ? (
          <p className="text-muted mb-3">No comments yet. Be the first to share your thoughts.</p>
        ) : (
          <div className="list-group">
            {comments.map((comment) => {
              const avatarUrl = getAvatarUrlFromName(comment.user_name)
              return (
                <div className="list-group-item py-3" key={comment.id}>
                  <div className="d-flex gap-3">
                    <img
                      src={avatarUrl}
                      alt={comment.user_name ?? 'Anonymous'}
                      className="comment-avatar shadow-sm"
                    />
                    <div className="flex-grow-1">
                      <div className="d-flex flex-wrap justify-content-between align-items-center mb-1">
                        <strong>{comment.user_name ?? 'Anonymous'}</strong>
                        <span className="text-body-secondary small">
                          {new Date(comment.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="mb-0 text-body">{comment.text ?? ''}</p>
                    </div>
                  </div>
                </div>
              )
            })}
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
          {user ? (
            <div className="col-12">
              <div className="d-flex align-items-center gap-3 bg-body-tertiary rounded p-3">
                {userAvatarUrl ? (
                  <img src={userAvatarUrl} alt={userDisplayName} className="comment-avatar shadow-sm" />
                ) : (
                  <div className="comment-avatar bg-body-secondary" />
                )}
                <div>
                  <p className="mb-0 fw-medium">Commenting as {userDisplayName}</p>
                  <p className="mb-0 text-body-secondary small">Your profile will be linked to this comment.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="col-12 col-md-4">
              <label htmlFor="comment-name" className="form-label">
                Your name
              </label>
              <input
                id="comment-name"
                name="userName"
                type="text"
                className="form-control"
                value={guestName}
                onChange={handleCommentInput}
                placeholder="Jane Doe"
                autoComplete="name"
                disabled={commentActionDisabled}
                required
              />
            </div>
          )}
          <div className="col-12">
            <label htmlFor="comment-text" className="form-label">
              Comment
            </label>
            <textarea
              id="comment-text"
              name="text"
              className="form-control"
              rows={4}
              value={commentText}
              onChange={handleCommentInput}
              placeholder="Share your thoughts..."
              disabled={commentActionDisabled}
              required
            />
          </div>
          <div className="col-12 d-flex align-items-center gap-3">
            <button type="submit" className="btn btn-primary" disabled={commentActionDisabled}>
              {commentButtonLabel}
            </button>
            {commentActionDisabled ? (
              <span className="text-muted small">We'll enable this again once Supabase confirms your comment.</span>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  )
}

export default NewsDetailPage
