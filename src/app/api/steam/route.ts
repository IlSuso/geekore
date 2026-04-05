import { NextResponse } from 'next/server'

// This endpoint is deprecated — use /api/steam/games for importing games
// and /api/steam/connect + /api/steam/callback for account linking.
export async function GET() {
  return NextResponse.json(
    { error: 'Endpoint deprecato. Usa /api/steam/games.' },
    { status: 410 }
  )
}
