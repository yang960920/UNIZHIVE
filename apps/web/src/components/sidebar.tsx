import Link from "next/link";
export function Sidebar({
  items,
  title = "WORKSPACE",
}: {
  items: { href: string; label: string }[];
  title?: string;
}) {
  return (
    <nav className="sidebar" aria-label={title}>
      <p className="eyebrow">{title}</p>
      {items.map((item) => (
        <Link key={item.href} href={item.href} prefetch={false}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
