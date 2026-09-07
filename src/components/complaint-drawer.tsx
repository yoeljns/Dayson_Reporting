"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Drawer } from "@/components/ui/drawer";

/** Wraps server-rendered complaint detail in a URL-driven side panel. */
export function ComplaintDrawer({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const open = Boolean(params.get("id"));
  function close() {
    const sp = new URLSearchParams(params.toString());
    sp.delete("id");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }
  return (
    <Drawer open={open} onClose={close} title={title}>
      {children}
    </Drawer>
  );
}
