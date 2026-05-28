import { createDb } from "@/lib/db"
import { and, eq, gt, lt, or, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { emails } from "@/lib/schema"
import { encodeCursor, decodeCursor } from "@/lib/cursor"
import { getUserId } from "@/lib/apiKey"

export const runtime = "edge"

const DEFAULT_PAGE_SIZE = 100

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&")
}

export async function GET(request: Request) {
  const userId = await getUserId()

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor')
  const search = searchParams.get("search")?.trim() || ""
  const domain = searchParams.get("domain")?.trim() || ""
  const includeTotal = searchParams.get("includeTotal") !== "0"
  const limitParam = Number(searchParams.get("limit"))
  const pageSize = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(limitParam, 200)
    : DEFAULT_PAGE_SIZE
  const searchTerm = search.toLowerCase()
  const domainTerm = domain.toLowerCase()
  
  const db = createDb()

  try {
    const baseConditions = and(
      eq(emails.userId, userId!),
      gt(emails.expiresAt, new Date())
    )

    const conditions = [baseConditions]

    if (searchTerm) {
      const keyword = `%${escapeLike(searchTerm)}%`
      conditions.push(or(
        sql`LOWER(${emails.id}) LIKE ${keyword} ESCAPE '\\'`,
        sql`LOWER(${emails.address}) LIKE ${keyword} ESCAPE '\\'`,
        sql`LOWER(CAST(${emails.createdAt} AS TEXT)) LIKE ${keyword} ESCAPE '\\'`,
        sql`LOWER(CAST(${emails.expiresAt} AS TEXT)) LIKE ${keyword} ESCAPE '\\'`
      ))
    }

    if (domainTerm) {
      const domainKeyword = `%${escapeLike(domainTerm.replace(/^@/, ""))}`
      conditions.push(sql`SUBSTR(LOWER(${emails.address}), INSTR(LOWER(${emails.address}), '@') + 1) LIKE ${domainKeyword} ESCAPE '\\'`)
    }

    const totalCount = includeTotal
      ? Number((await db.select({ count: sql<number>`count(*)` })
          .from(emails)
          .where(and(...conditions)))[0].count)
      : null

    if (cursor) {
      const { timestamp, id } = decodeCursor(cursor)
      conditions.push(
        or(
          lt(emails.createdAt, new Date(timestamp)),
          and(
            eq(emails.createdAt, new Date(timestamp)),
            lt(emails.id, id)
          )
        )
      )
    }

    const results = await db.query.emails.findMany({
      where: and(...conditions),
      orderBy: (emails, { desc }) => [
        desc(emails.createdAt),
        desc(emails.id)
      ],
      limit: pageSize + 1
    })
    
    const hasMore = results.length > pageSize
    const nextCursor = hasMore 
      ? encodeCursor(
          results[pageSize - 1].createdAt.getTime(),
          results[pageSize - 1].id
        )
      : null
    const emailList = hasMore ? results.slice(0, pageSize) : results

    return NextResponse.json({ 
      emails: emailList,
      nextCursor,
      total: totalCount,
      hasMore
    })
  } catch (error) {
    console.error('Failed to fetch user emails:', error)
    return NextResponse.json(
      { error: "Failed to fetch emails" },
      { status: 500 }
    )
  }
} 
