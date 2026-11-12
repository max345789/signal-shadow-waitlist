import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import { isRedisConfigured } from "@/lib/queues/redis";
import { getDefaultCurrency } from "@/lib/format/currency";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "trust-marketplace",
      databaseConfigured: isDatabaseConfigured(),
      redisConfigured: isRedisConfigured(),
      defaultCurrency: getDefaultCurrency(),
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
