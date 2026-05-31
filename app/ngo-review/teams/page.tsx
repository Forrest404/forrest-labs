import { redirect } from 'next/navigation'

// NGO review moved into the admin panel. Keep old bookmarks working.
export default function NgoReviewTeamsMoved() {
  redirect('/admin/ngo-review?tab=teams')
}
