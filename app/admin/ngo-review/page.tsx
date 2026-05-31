import { redirect } from 'next/navigation'

// NGO oversight moved to the platform-operator console. Keep old links working.
export default function AdminNgoReviewMoved() {
  redirect('/platform/review')
}
