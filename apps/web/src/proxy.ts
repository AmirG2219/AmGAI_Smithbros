import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie and sends signed-out visitors to /login.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/inquiry") ||
    path.startsWith("/api/intake") ||
    path.startsWith("/api/inbound") ||
    path.startsWith("/embed") ||
    path.startsWith("/unsubscribe") ||
    path.startsWith("/api/unsubscribe");
  if (!user && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return response;
}

export const config = {
  // Static files (images, fonts, scripts) are public by nature, so the login check skips them.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:png|jpg|jpeg|svg|webp|ico|woff2|js|html)$).*)"],
};
