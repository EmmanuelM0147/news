import { useParams } from 'react-router-dom'

export function TagPage() {
  const { tag } = useParams<{ tag: string }>()

  return (
    <div className="py-4">
      <h1 className="mb-3">News Tagged</h1>
      <p className="text-muted">Filtering news by tag: {tag}</p>
    </div>
  )
}

export default TagPage
