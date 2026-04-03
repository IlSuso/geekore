import NextAuth, { NextAuthOptions } from "next-auth";
import SteamProvider from "next-auth-steam";
import { NextRequest } from "next/server";

/**
 * Funzione per generare le opzioni di NextAuth.
 * Passiamo 'req' perché il provider di Steam ne ha bisogno per gestire l'OpenID.
 */
const getAuthOptions = (req: NextRequest): NextAuthOptions => ({
  providers: [
    SteamProvider(req, {
      // USIAMO IL TUO NOME VARIABILE: STEAM_API_KEY
      clientSecret: process.env.STEAM_API_KEY || "",
      callbackUrl: `${process.env.NEXTAUTH_URL}/api/auth/callback`,
    }),
  ],
  callbacks: {
    // Salviamo lo SteamID64 nel Token JWT quando l'utente logga
    async jwt({ token, profile }) {
      if (profile) {
        // @ts-ignore - profile.steamid arriva dal provider steam
        token.steamId = profile.steamid;
      }
      return token;
    },
    // Esponiamo lo SteamID alla sessione (accessibile nel frontend tramite useSession)
    async session({ session, token }) {
      if (session.user) {
        // @ts-ignore
        session.user.id = token.steamId;
      }
      return session;
    },
  },
  // Segreto per criptare i cookie di sessione
  secret: process.env.NEXTAUTH_SECRET,
  // Debug attivo in sviluppo per vedere log dettagliati nel terminale
  debug: process.env.NODE_ENV === "development",
});

/**
 * Gestore principale per le richieste Auth.
 * Next.js 16 (App Router) richiede l'esportazione di GET e POST.
 */
async function handler(req: NextRequest, ctx: { params: { nextauth: string[] } }) {
  // @ts-ignore - Workaround necessario per compatibilità tipi Next.js 16/Turbopack
  return await NextAuth(req, ctx, getAuthOptions(req));
}

export { handler as GET, handler as POST };