import { NextResponse } from 'next/server'
import { stats } from '@/lib/store'
export async function GET() { return NextResponse.json(await stats()) }
