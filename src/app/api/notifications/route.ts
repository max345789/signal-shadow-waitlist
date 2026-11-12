import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session-server";
import {
  listNotificationsForUser,
  markAllNotificationsRead,
} from "@/lib/matching/store";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to view your thesis match notifications." },
      { status: 401 }
    );
  }

  const notifications = await listNotificationsForUser(session);
  return NextResponse.json(
    {
      notifications,
      unreadCount: notifications.filter((n) => n.readAt === null).length,
    },
    { status: 200 }
  );
}

export async function POST() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to update notifications." },
      { status: 401 }
    );
  }

  const result = await markAllNotificationsRead(session);
  return NextResponse.json(result, { status: 200 });
}
