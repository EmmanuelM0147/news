import type { User } from '@supabase/supabase-js'

const generateAvatarUrl = (name: string) => {
  const params = new URLSearchParams({
    seed: name,
    backgroundColor: '0f62fe,6929c4,1192e8',
    fontSize: '40',
  })

  return `https://api.dicebear.com/7.x/initials/svg?${params.toString()}`
}

const extractName = (user?: User | null) => {
  if (!user) {
    return null
  }

  const metadataName = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null
  const displayName = metadataName?.trim() || user.email || user.phone

  if (displayName) {
    return displayName
  }

  return `User ${user.id.slice(0, 6)}`
}

export const getUserDisplayName = (user?: User | null, fallback = 'Anonymous') =>
  extractName(user) ?? fallback

export const getUserAvatarUrl = (user?: User | null) => {
  if (!user) {
    return null
  }

  const metadataUrl = typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null
  if (metadataUrl) {
    return metadataUrl
  }

  const name = extractName(user)
  if (!name) {
    return null
  }

  return generateAvatarUrl(name)
}

export const getAvatarUrlFromName = (name: string | null | undefined) => {
  const safeName = name?.trim()
  if (!safeName) {
    return generateAvatarUrl('Anonymous')
  }

  return generateAvatarUrl(safeName)
}
