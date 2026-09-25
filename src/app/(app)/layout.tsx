import Link from "next/link";
import { SignOutButton } from "@/components/nav/sign-out-button";

const NAV_LINKS = [
  { href: "/chat", label: "Chat" },
  { href: "/memory", label: "Memory" },
  { href: "/review", label: "Review" },
  { href: "/sources", label: "Sources" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-6">
          <span className="text-sm font-semibold">Personal AI</span>
          <nav className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-2.5 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <SignOutButton />
      </header>
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
