import { redirect } from 'next/navigation'

// NGO oversight lives in the platform-operator console. The standalone cross-org
// teams view is retired; team counts live under each org in Manage NGOs.
export default function NgoReviewTeamsMoved() {
  redirect('/platform/ngos')
}
