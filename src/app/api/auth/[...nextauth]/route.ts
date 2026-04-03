import NextAuth, { NextAuthOptions } from "next-auth";
import SteamProvider from "next-auth-steam";
import { NextRequest } from "next/server";

const getAuthOptions = (req: NextRequest): NextAuthOptions => ({
  providers: [
    SteamProvider(req, {
      clientSecret: process.env.STEAM_API_KEY || "",
      callbackUrl: `${process.env.NEXTAUTH_URL}/api/auth/callback`,
    }),
  ],
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        // @ts-ignore
        token.steamId = profile.steamid;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // @ts-ignore
        session.user.id = token.steamId;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
});

// IL FIX PER NEXT.JS 16: 'context' deve gestire la Promise per i params
async function handler(
  req: NextRequest, 
  context: { params: Promise<{ nextauth: string[] }> } 
) {
  // Anche se non usiamo direttamente 'nextauth' qui, 
  // dobbiamo tipizzarlo come Promise per soddisfare il build di Next 16
  await context.params; 
  
  // @ts-ignore
  return await NextAuth(req, context, getAuthOptions(req));
}

export { handler as GET, handler as POST };