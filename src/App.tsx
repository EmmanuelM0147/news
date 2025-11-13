import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { useAuth } from './hooks/useAuth'
import AdminPage from './pages/AdminPage'
import NewsDetailPage from './pages/NewsDetailPage'
import NewsPage from './pages/NewsPage'
import StatsPage from './pages/StatsPage'
import TagPage from './pages/TagPage'

function App() {
  const { user, isLoading: authLoading, isSigningIn, authError, signInAnonymously, signOut } = useAuth()
  const userLabel = user?.email ?? user?.user_metadata?.full_name ?? (user ? `User ${user.id.slice(0, 6)}` : null)

  return (
    <div className="min-vh-100 bg-body-secondary">
      <nav className="navbar navbar-expand-lg navbar-light bg-body-tertiary border-bottom">
        <div className="container">
          <NavLink className="navbar-brand fw-semibold" to="/news" end>
            NewsList
          </NavLink>
          <button
            className="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#navbarNav"
            aria-controls="navbarNav"
            aria-expanded="false"
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon" />
          </button>
          <div className="collapse navbar-collapse" id="navbarNav">
            <ul className="navbar-nav ms-auto gap-lg-3">
              <li className="nav-item">
                <NavLink className="nav-link" to="/news" end>
                  News
                </NavLink>
              </li>
              <li className="nav-item">
                <NavLink className="nav-link" to="/admin">
                  Admin
                </NavLink>
              </li>
              <li className="nav-item">
                <NavLink className="nav-link" to="/stats">
                  Stats
                </NavLink>
              </li>
            </ul>
            <div className="d-lg-flex align-items-center ms-lg-3 mt-3 mt-lg-0 gap-2">
              {authError ? <span className="text-danger small">{authError}</span> : null}
              {authLoading ? (
                <span className="text-muted small">Checking auth…</span>
              ) : user ? (
                <>
                  <span className="text-body-secondary small">{userLabel}</span>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => void signOut()}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void signInAnonymously()}
                  disabled={isSigningIn}
                >
                  {isSigningIn ? 'Signing in…' : 'Sign in'}
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="container py-4">
        <Routes>
          <Route path="/" element={<Navigate to="/news" replace />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/news/:id" element={<NewsDetailPage />} />
          <Route path="/tag/:tag" element={<TagPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="*" element={<Navigate to="/news" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
