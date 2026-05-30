import { redirect } from 'next/navigation'

// The NGO landing route. org_admin / team_leader land on the situation board;
// field coordinators are routed to /ngo/field by the middleware before they
// reach here.
export default function NgoHome() {
  redirect('/ngo/board')
}
