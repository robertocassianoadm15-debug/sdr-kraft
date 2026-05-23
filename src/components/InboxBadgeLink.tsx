'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export function InboxBadgeLink() {
  const [count, setCount] = useState(0);

  async function fetchCount() {
    try {
      const r = await fetch('/api/inbox/count');
      const j = await r.json();
      setCount(j.count ?? 0);
    } catch { /* silently ignore */ }
  }

  useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <Link
      href="/inbox"
      className="relative px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-navy-50 hover:text-navy-700 transition-colors"
    >
      Inbox
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold bg-red-500 text-white rounded-full leading-none">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  );
}
