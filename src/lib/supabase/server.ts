import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async get(name: string) {
          const cookie = await cookieStore;
          return cookie.get(name)?.value;
        },
        async set(name: string, value: string, options: any) {
          try {
            const cookie = await cookieStore;
            cookie.set(name, value, options);
          } catch (error) {
            // Ignora errori di scrittura durante la lettura (SSR)
          }
        },
        async remove(name: string, options: any) {
          try {
            const cookie = await cookieStore;
            cookie.set(name, '', { ...options, maxAge: 0 });
          } catch (error) {
            // Ignora errori di rimozione durante la lettura
          }
        },
      },
    }
  );
}