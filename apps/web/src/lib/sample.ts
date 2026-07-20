import type { CaseDraft } from './types'

export const sampleCase: CaseDraft = {
  projectName: 'Northstar launch site',
  clientName: 'Northstar Coffee',
  scopeTitle: 'Accepted website scope — version 1',
  scopeContent: [
    'Deliverables',
    '- Five responsive pages: Home, Story, Menu, Locations, Contact.',
    '- One content revision round after the first complete draft.',
    '- Contact form delivery to hello@northstar.example.',
    '- Launch target: Friday, 31 July 2026.',
    '',
    'Explicit exclusions',
    '- No booking, checkout, membership, or customer account system.',
    '- Additional content rounds require a written change proposal.',
    '- Client supplies final photography before 24 July 2026.',
  ].join('\n'),
  requestTitle: 'Quick additions before Friday',
  requestContent: [
    'Can you add table bookings with confirmation emails?',
    'We also need two more content revision rounds.',
    'The Friday launch date should stay the same.',
  ].join('\n'),
}

export function defaultDueDate(now = new Date(), days = 10): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
