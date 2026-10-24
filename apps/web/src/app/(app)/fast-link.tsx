"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

// A link that starts loading its page the moment the pointer reaches it (or a finger touches it),
// so by the time of the click the page is usually already there.
export function FastLink({ href, onMouseEnter, onTouchStart, ...rest }: ComponentProps<typeof Link>) {
  const router = useRouter();
  const warm = () => router.prefetch(String(href));
  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={(e) => {
        warm();
        onMouseEnter?.(e);
      }}
      onTouchStart={(e) => {
        warm();
        onTouchStart?.(e);
      }}
      {...rest}
    />
  );
}
