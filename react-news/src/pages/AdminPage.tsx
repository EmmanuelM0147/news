import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabaseClient'

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5MB
const MAX_FILES = 6

const generateFilePath = (file: File) => {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return `${randomPart}-${safeName}`
}

const extractStoragePath = (url: string) => {
  const [, path] = url.split('/news-pictures/')
  return path ? decodeURIComponent(path) : null
}

const parseTags = (input: string) => {
  const raw = input
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)

  const seen = new Set<string>()
  return raw.filter((tag) => {
    const key = tag.toLowerCase()
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

type NewsSummary = {
  id: string
  title: string
  created_at: string
}

type NewsDetail = {
  id: string
  title: string
  text: string
  tags: { name: string }[] | null
  pictures: { url: string }[] | null
}

type ExistingPicture = {
  url: string
  markedForRemoval?: boolean
}

type ToastState = {
  message: string
  variant: 'success' | 'danger'
}

export function AdminPage() {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [pictures, setPictures] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [bucketWarning, setBucketWarning] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  const [newsList, setNewsList] = useState<NewsSummary[]>([])
  const [isLoadingNews, setIsLoadingNews] = useState(false)
  const [newsError, setNewsError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<NewsSummary | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)

  const [editingNews, setEditingNews] = useState<NewsDetail | null>(null)
  const [existingPictures, setExistingPictures] = useState<ExistingPicture[]>([])
  const [isLoadingSelection, setIsLoadingSelection] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const toastTimeoutRef = useRef<number | null>(null)

  const parsedTags = useMemo(() => parseTags(tagsInput), [tagsInput])
  const isEditing = Boolean(editingNews)

  const ensureBucketExists = useCallback(async () => {
    try {
      const { error } = await supabase.storage.from('news-pictures').list('', { limit: 1 })
      if (error) {
        if (error.status === 404) {
          setBucketWarning(
            "Storage bucket 'news-pictures' was not found. Please create it in Supabase Storage and make it public to serve uploaded images.",
          )
        } else {
          setBucketWarning(`Could not verify storage bucket: ${error.message}`)
        }
      } else {
        setBucketWarning(null)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected storage error'
      setBucketWarning(`Could not verify storage bucket: ${message}`)
    }
  }, [])

  const loadNews = useCallback(async () => {
    setIsLoadingNews(true)
    setNewsError(null)
    try {
      const { data, error } = await supabase
        .from('news')
        .select('id, title, created_at')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        setNewsError(error.message)
        return
      }

      setNewsList(data ?? [])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error while loading news'
      setNewsError(message)
    } finally {
      setIsLoadingNews(false)
    }
  }, [])

  useEffect(() => {
    void ensureBucketExists()
    void loadNews()
    return () => {
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current)
      }
    }
  }, [ensureBucketExists, loadNews])

  const handlePicturesChange = (event: ChangeEvent<HTMLInputElement>) => {
    setStatus(null)
    setValidationError(null)
    const files = event.target.files ? Array.from(event.target.files) : []

    if (files.length > MAX_FILES) {
      setValidationError(`Please upload at most ${MAX_FILES} images.`)
      setPictures([])
      return
    }

    const invalid = files.find((file) => !file.type.startsWith('image/'))
    if (invalid) {
      setValidationError(`File "${invalid.name}" is not an image.`)
      setPictures([])
      return
    }

    const tooLarge = files.find((file) => file.size > MAX_FILE_SIZE_BYTES)
    if (tooLarge) {
      setValidationError(`File "${tooLarge.name}" exceeds the 5MB size limit.`)
      setPictures([])
      return
    }

    setPictures(files)
  }

  const resetForm = () => {
    setTitle('')
    setText('')
    setTagsInput('')
    setPictures([])
    setValidationError(null)
    setEditingNews(null)
    setExistingPictures([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const showToast = (payload: ToastState) => {
    setToast(payload)
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current)
    }
    toastTimeoutRef.current = window.setTimeout(() => setToast(null), 4000)
  }

  const syncTags = useCallback(
    async (newsId: string) => {
      const { error: clearError } = await supabase.from('news_tags').delete().eq('news_id', newsId)
      if (clearError) {
        throw new Error(`Failed to clear existing tags: ${clearError.message}`)
      }

      if (parsedTags.length === 0) {
        return
      }

      const tagPayload = parsedTags.map((name) => ({ name }))
      const { error: upsertError } = await supabase.from('tags').upsert(tagPayload, { onConflict: 'name' })

      if (upsertError) {
        throw new Error(`Failed to upsert tags: ${upsertError.message}`)
      }

      const { data: tagsData, error: selectTagsError } = await supabase
        .from('tags')
        .select('id, name')
        .in('name', parsedTags)

      if (selectTagsError) {
        throw new Error(`Failed to fetch tags: ${selectTagsError.message}`)
      }

      if (tagsData && tagsData.length > 0) {
        const newsTags = tagsData.map((tag) => ({ news_id: newsId, tag_id: tag.id }))
        const { error: newsTagsError } = await supabase.from('news_tags').insert(newsTags)

        if (newsTagsError) {
          throw new Error(`Failed to link tags: ${newsTagsError.message}`)
        }
      }
    },
    [parsedTags],
  )

  const syncPictures = useCallback(
    async (newsId: string) => {
      const picturesToDelete = existingPictures.filter((picture) => picture.markedForRemoval)
      if (picturesToDelete.length > 0) {
        const paths = picturesToDelete
          .map((picture) => extractStoragePath(picture.url))
          .filter((path): path is string => Boolean(path))
        if (paths.length > 0) {
          const { error: storageError } = await supabase.storage.from('news-pictures').remove(paths)
          if (storageError) {
            throw new Error(`Failed to remove existing pictures from storage: ${storageError.message}`)
          }
        }

        const { error: deleteError } = await supabase
          .from('pictures')
          .delete()
          .eq('news_id', newsId)
          .in(
            'url',
            picturesToDelete.map((picture) => picture.url),
          )

        if (deleteError) {
          throw new Error(`Failed to remove picture records: ${deleteError.message}`)
        }
      }

      const uploadedPictures: { path: string; publicUrl: string }[] = []

      if (pictures.length > 0) {
        for (const file of pictures) {
          const path = generateFilePath(file)
          const { error: uploadError } = await supabase.storage
            .from('news-pictures')
            .upload(path, file, { cacheControl: '3600', upsert: false })

          if (uploadError) {
            throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`)
          }

          const { data: publicData } = supabase.storage.from('news-pictures').getPublicUrl(path)
          if (!publicData?.publicUrl) {
            throw new Error(`Unable to obtain public URL for ${file.name}.`)
          }

          uploadedPictures.push({ path, publicUrl: publicData.publicUrl })
        }

        const pictureRows = uploadedPictures.map((picture) => ({
          news_id: newsId,
          url: picture.publicUrl,
        }))

        const { error: picturesError } = await supabase.from('pictures').insert(pictureRows)

        if (picturesError) {
          throw new Error(`Failed to save picture metadata: ${picturesError.message}`)
        }
      }

      if (picturesToDelete.length > 0 || pictures.length > 0) {
        const { data: refreshedPictures, error: refreshError } = await supabase
          .from('pictures')
          .select('url')
          .eq('news_id', newsId)

        if (refreshError) {
          throw new Error(`Failed to refresh picture list: ${refreshError.message}`)
        }

        setExistingPictures((refreshedPictures ?? []).map((picture) => ({ url: picture.url })))
      }
    },
    [existingPictures, pictures],
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedTitle = title.trim()
    const trimmedText = text.trim()

    if (!trimmedTitle || !trimmedText) {
      setStatus({ type: 'error', message: 'Please provide both a title and text for the news article.' })
      return
    }

    if (validationError) {
      setStatus({ type: 'error', message: 'Please fix the issues with the selected files before submitting.' })
      return
    }

    setIsSubmitting(true)
    setStatus(null)

    try {
      if (isEditing && editingNews) {
        const { data: updated, error: updateError } = await supabase
          .from('news')
          .update({ title: trimmedTitle, text: trimmedText })
          .eq('id', editingNews.id)
          .select('id, created_at, title')
          .single()

        if (updateError || !updated?.id) {
          throw new Error(updateError?.message ?? 'Failed to update news article.')
        }

        await syncTags(editingNews.id)
        await syncPictures(editingNews.id)

        setStatus({ type: 'success', message: 'News article updated successfully!' })
        setNewsList((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
        resetForm()
        await loadNews()
      } else {
        const { data: newsData, error: newsError } = await supabase
          .from('news')
          .insert({ title: trimmedTitle, text: trimmedText })
          .select('id, created_at, title')
          .single()

        if (newsError || !newsData?.id) {
          throw new Error(newsError?.message ?? 'Failed to create news article.')
        }

        const newsId = newsData.id

        await syncTags(newsId)
        await syncPictures(newsId)

        setStatus({ type: 'success', message: 'News article created successfully!' })
        resetForm()
        setNewsList((prev) => [newsData, ...prev])
      }
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : 'Unexpected error while creating news article.'
      setStatus({ type: 'error', message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSelectNews = useCallback(
    async (newsId: string) => {
      setIsLoadingSelection(true)
      setStatus(null)
      setValidationError(null)
      try {
        const { data, error } = await supabase
          .from('news')
          .select('id, title, text, tags(name), pictures(url)')
          .eq('id', newsId)
          .single()

        if (error || !data) {
          throw new Error(error?.message ?? 'Failed to load news details.')
        }

        const detail: NewsDetail = {
          id: data.id,
          title: data.title,
          text: data.text,
          tags: data.tags,
          pictures: data.pictures,
        }

        setEditingNews(detail)
        setTitle(detail.title)
        setText(detail.text)
        setTagsInput(detail.tags?.map((tag) => tag.name).join(', ') ?? '')
        setExistingPictures(detail.pictures?.map((picture) => ({ url: picture.url })) ?? [])
        setPictures([])
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      } catch (error) {
        console.error(error)
        const message = error instanceof Error ? error.message : 'Unexpected error while loading news details.'
        setStatus({ type: 'error', message })
      } finally {
        setIsLoadingSelection(false)
      }
    },
    [setStatus],
  )

  const confirmDelete = async () => {
    if (!deleteTarget) {
      return
    }

    setIsDeleting(true)
    try {
      const { error } = await supabase.from('news').delete().eq('id', deleteTarget.id)
      if (error) {
        throw new Error(error.message)
      }

      setNewsList((prev) => prev.filter((item) => item.id !== deleteTarget.id))
      showToast({ message: `News "${deleteTarget.title}" deleted.`, variant: 'success' })
      setDeleteTarget(null)
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : 'Failed to delete news article.'
      showToast({ message, variant: 'danger' })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="py-4 position-relative">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 mb-0">Admin &bull; Manage News</h1>
        <span className="text-body-secondary small">
          {parsedTags.length} tag{parsedTags.length === 1 ? '' : 's'} selected &middot; {pictures.length} image
          {pictures.length === 1 ? '' : 's'} ready
        </span>
      </div>

      {bucketWarning ? (
        <div className="alert alert-warning" role="alert">
          {bucketWarning}
        </div>
      ) : null}

      {status ? (
        <div
          className={`alert ${status.type === 'success' ? 'alert-success' : 'alert-danger'}`}
          role="alert"
        >
          {status.message}
        </div>
      ) : null}

      {validationError ? (
        <div className="alert alert-danger" role="alert">
          {validationError}
        </div>
      ) : null}

      <div className="row g-5">
        <div className="col-12 col-lg-6">
          {isEditing && editingNews ? (
            <div className="alert alert-info" role="status">
              Editing “{editingNews.title}”. Submit to save changes or reset to create a new article.
            </div>
          ) : null}
          <form className="row gy-4" onSubmit={handleSubmit}>
            <div className="col-12">
              <label htmlFor="admin-title" className="form-label">
                Title
              </label>
              <input
                id="admin-title"
                type="text"
                className="form-control"
                placeholder="Breaking news headline"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value)
                  setStatus(null)
                }}
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="col-12">
              <label htmlFor="admin-text" className="form-label">
                Text
              </label>
              <textarea
                id="admin-text"
                className="form-control"
                rows={6}
                placeholder="Write the full article here..."
                value={text}
                onChange={(event) => {
                  setText(event.target.value)
                  setStatus(null)
                }}
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="col-12 col-md-6">
              <label htmlFor="admin-tags" className="form-label">
                Tags (comma separated)
              </label>
              <input
                id="admin-tags"
                type="text"
                className="form-control"
                placeholder="technology, ai, supabase"
                value={tagsInput}
                onChange={(event) => {
                  setTagsInput(event.target.value)
                  setStatus(null)
                }}
                disabled={isSubmitting}
              />
              {parsedTags.length > 0 ? (
                <div className="form-text">
                  Parsed tags: {parsedTags.join(', ')}
                </div>
              ) : null}
            </div>

            <div className="col-12 col-md-6">
              <label htmlFor="admin-pictures" className="form-label">
                Pictures
              </label>
              <input
                id="admin-pictures"
                ref={fileInputRef}
                type="file"
                className="form-control"
                accept="image/*"
                multiple
                onChange={handlePicturesChange}
                disabled={isSubmitting}
              />
              {pictures.length > 0 ? (
                <ul className="list-group list-group-flush mt-2">
                  {pictures.map((file) => (
                    <li className="list-group-item px-0 py-1 small text-muted" key={`${file.name}-${file.lastModified}`}>
                      {file.name} ({Math.round(file.size / 1024)} KB)
                    </li>
                  ))}
                </ul>
              ) : null}
              {existingPictures.length > 0 ? (
                <div className="mt-3">
                  <div className="form-label">Current pictures</div>
                  <ul className="list-group list-group-flush">
                    {existingPictures.map((picture, index) => (
                      <li className="list-group-item d-flex align-items-center justify-content-between px-0 py-1" key={picture.url}>
                        <span className="small text-truncate" style={{ maxWidth: '70%' }}>
                          #{index + 1} {picture.url.split('/').slice(-1)[0]}
                        </span>
                        <div className="form-check form-switch">
                          <input
                            id={`remove-picture-${index}`}
                            type="checkbox"
                            className="form-check-input"
                            checked={Boolean(picture.markedForRemoval)}
                            onChange={() =>
                              setExistingPictures((prev) =>
                                prev.map((item) =>
                                  item.url === picture.url ? { ...item, markedForRemoval: !item.markedForRemoval } : item,
                                ),
                              )
                            }
                          />
                          <label className="form-check-label small" htmlFor={`remove-picture-${index}`}>
                            Remove
                          </label>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="col-12 d-flex gap-3">
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : isEditing ? 'Update News' : 'Publish News'}
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  resetForm()
                  setStatus(null)
                }}
                disabled={isSubmitting}
              >
                {isEditing ? 'Cancel editing' : 'Reset'}
              </button>
            </div>
          </form>
        </div>

        <div className="col-12 col-lg-6">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h2 className="h5 mb-0">Recent News</h2>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => void loadNews()}
              disabled={isLoadingNews}
            >
              {isLoadingNews ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          {newsError ? (
            <div className="alert alert-danger" role="alert">
              {newsError}
            </div>
          ) : null}
          <div className="list-group">
            {newsList.length === 0 && !isLoadingNews ? (
              <div className="list-group-item text-muted">No news articles yet.</div>
            ) : null}
            {newsList.map((item) => (
              <div
                className={`list-group-item d-flex justify-content-between align-items-center ${
                  editingNews?.id === item.id ? 'border-primary-subtle border-2' : ''
                }`}
                key={item.id}
              >
                <div>
                  <h3 className="h6 mb-1">{item.title}</h3>
                  <p className="mb-0 text-body-secondary small">
                    {dayjs(item.created_at).format('MMM D, YYYY h:mm A')}
                  </p>
                </div>
                <div className="btn-group">
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm"
                    onClick={() => void handleSelectNews(item.id)}
                    disabled={isLoadingSelection}
                  >
                    {isLoadingSelection && editingNews?.id !== item.id ? 'Loading…' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => setDeleteTarget(item)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {deleteTarget ? (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Confirm deletion</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setDeleteTarget(null)}
                  aria-label="Close"
                  disabled={isDeleting}
                />
              </div>
              <div className="modal-body">
                Are you sure you want to delete this news?
                <div className="mt-2 fw-semibold">{deleteTarget.title}</div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setDeleteTarget(null)}
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => void confirmDelete()}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="toast-container position-fixed top-0 end-0 p-3" style={{ zIndex: 1056 }}>
          <div className={`toast show align-items-center text-bg-${toast.variant}`} role="alert">
            <div className="d-flex">
              <div className="toast-body">{toast.message}</div>
              <button
                type="button"
                className="btn-close btn-close-white me-2 m-auto"
                onClick={() => setToast(null)}
                aria-label="Close"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default AdminPage
