import { redirect } from 'next/navigation'

export default function EditProfileRedirect() {
  redirect('/settings/profile')
}
