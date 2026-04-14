import { redirect } from 'next/navigation'

// /profile senza username → manda sempre a /profile/me
// che poi pensa lui a trovare l'username dell'utente loggato
export default function ProfileRootRedirect() {
  redirect('/profile/me')
}