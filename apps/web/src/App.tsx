import { useEffect } from 'react'
import { AgencyWorkspace } from './components/AgencyWorkspace'
import { PublicProposal } from './components/PublicProposal'
import { getShareToken, scrubbedSharePath } from './lib/domain'
import './App.css'

export function App() {
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const hasLegacyShare = search.has('share')
  const hasFragmentShare = hash.has('share')
  const token = getShareToken(window.location.search, window.location.hash)

  useEffect(() => {
    if (!hasLegacyShare) return
    window.history.replaceState(
      null,
      '',
      scrubbedSharePath(window.location.pathname, window.location.search, token),
    )
  }, [hasLegacyShare, token])

  return !hasLegacyShare && !hasFragmentShare ? (
    <AgencyWorkspace />
  ) : (
    <PublicProposal token={token} />
  )
}
