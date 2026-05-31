import { redirect } from 'next/navigation'

// NGO oversight lives in the platform-operator console. Keep old bookmarks working.
export default function NgoReviewOrgsMoved() {
  redirect('/platform/ngos')
}
