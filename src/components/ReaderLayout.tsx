import Link from "next/link";
import { Globe, Lock } from "lucide-react";
import { LibraryTree, type TreeItem } from "./LibraryTree";

export function ReaderLayout({
  slug,
  library,
  libraries,
  items,
  currentId,
  canEdit,
  outline,
  children,
}: {
  slug: string;
  library: { id: number; name: string; is_public: boolean };
  libraries: { id: number; name: string }[];
  items: TreeItem[];
  currentId?: number;
  canEdit: boolean;
  outline?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="shell grid grid-cols-1 md:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_220px] gap-8">
      <aside className="md:sticky md:top-[60px] md:h-[calc(100vh-60px)] md:overflow-y-auto py-6 md:border-r hairline md:pr-4">
        <Link href={`/p/${slug}/kb/${library.id}`} className="flex items-center gap-2 px-1 mb-3 font-semibold hover:underline underline-offset-4">
          {library.is_public ? <Globe size={14} className="muted" /> : <Lock size={14} className="muted" />}
          <span className="truncate">{library.name}</span>
        </Link>
        {libraries.length > 1 && (
          <details className="mb-3 px-1 text-xs">
            <summary className="muted cursor-pointer">切换知识库</summary>
            <div className="mt-1 space-y-0.5">
              {libraries.map((l) => (
                <Link key={l.id} href={`/p/${slug}/kb/${l.id}`} className="block px-2 py-1 rounded hover:bg-[var(--panel-2)] truncate">
                  {l.name}
                </Link>
              ))}
            </div>
          </details>
        )}
        <LibraryTree libraryId={library.id} libraries={libraries} items={items} currentId={currentId} canEdit={canEdit} />
      </aside>
      <div className="min-w-0 py-8">{children}</div>
      <aside className="hidden xl:block sticky top-[60px] h-[calc(100vh-60px)] overflow-y-auto py-8">{outline}</aside>
    </div>
  );
}
