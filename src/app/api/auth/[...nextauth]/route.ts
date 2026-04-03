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

// FIX OBBLIGATORIO PER NEXT.JS 16: params deve essere Promise
export async function GET(req: NextRequest, { params }: { params: Promise<{ nextauth: string[] }> }) {
  const resolvedParams = await params;
  // @ts-ignore
  return await NextAuth(req, { params: resolvedParams }, getAuthOptions(req));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ nextauth: string[] }> }) {
  const resolvedParams = await params;
  // @ts-ignore
  return await NextAuth(req, { params: resolvedParams }, getAuthOptions(req));
}