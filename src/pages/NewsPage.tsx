import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const BATCH_SIZE = 3;

type NewsTag = {
  name: string | null;
};

type NewsPicture = {
  url: string | null;
};

type NewsItem = {
  id: string;
  title: string;
  text: string;
  created_at: string;
  tags: NewsTag[] | null;
  pictures: NewsPicture[] | null;
};

export function NewsPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const fetchNews = useCallback(async () => {
    if (isLoading || !hasMore) {
      return;
    }

    setIsLoading(true);
    setError(null);

    const from = items.length;
    const to = from + BATCH_SIZE - 1;

    const { data, error: fetchError } = await supabase
      .from('news')
      .select('id, title, text, created_at, tags(name), pictures(url)')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (fetchError) {
      setError(fetchError.message);
      setIsLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setHasMore(false);
      setIsLoading(false);
      return;
    }

    setItems((prev) => [...prev, ...data]);
    setHasMore(data.length === BATCH_SIZE);
    setIsLoading(false);
  }, [hasMore, isLoading, items.length]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  useEffect(() => {
    const element = loaderRef.current;
    if (!element) {
      return;
    }

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          fetchNews();
        }
      },
      { rootMargin: '200px' }
    );

    observerRef.current.observe(element);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [fetchNews]);

  return (
    <div className="py-4">
      <h1 className="mb-4">Latest News</h1>
      <div className="row gy-4">
        {items.map((item) => {
          const preview =
            item.text.length > 200 ? `${item.text.slice(0, 200)}…` : item.text;
          const tags = item.tags ?? [];
          const firstImage = (item.pictures ?? []).find(
            (picture) => picture.url
          )?.url;

          return (
            <div className="col-12" key={item.id}>
              <div className="card h-100 shadow-sm">
                {firstImage ? (
                  <img
                    src={firstImage}
                    className="card-img-top"
                    alt={item.title}
                    style={{ objectFit: 'cover', maxHeight: '240px' }}
                  />
                ) : null}
                <div className="card-body">
                  <h2 className="card-title h4">{item.title}</h2>
                  <p className="card-text text-body-secondary mb-2">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                  <p className="card-text">{preview}</p>
                  {tags.length > 0 ? (
                    <div className="d-flex flex-wrap gap-2 mt-3">
                      {tags.map(
                        (tag) =>
                          tag.name && (
                            <span
                              key={tag.name}
                              className="badge bg-secondary-subtle text-secondary-emphasis"
                            >
                              {tag.name}
                            </span>
                          )
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {error ? (
        <div className="alert alert-danger mt-4" role="alert">
          {error}
        </div>
      ) : null}
      <div ref={loaderRef} className="py-4 text-center">
        {isLoading ? (
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading…</span>
          </div>
        ) : hasMore ? (
          <span className="text-muted">Scroll to load more</span>
        ) : (
          <span className="text-muted">No more news to display</span>
        )}
      </div>
    </div>
  );
}

export default NewsPage;

