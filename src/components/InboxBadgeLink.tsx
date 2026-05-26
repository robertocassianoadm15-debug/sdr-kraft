'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export function InboxBadgeLink() {
  const [count, setCount] = useState(0);
  const [pulsing, setPulsing] = useState(false);
  const prevCount = useRef(0);

  function playNotificationSound() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 520;
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  }

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

  useEffect(() => {
    if (count > prevCount.current && prevCount.current !== 0) {
      playNotificationSound();
      setPulsing(true);
      setTimeout(() => setPulsing(false), 3000);
      document.title = `(${count}) Inbox — SDR-KRAFT`;
    } else if (count === 0) {
      document.title = 'SDR-KRAFT';
    }
    prevCount.current = count;
  }, [count]);

  return (
    <Link
      href="/inbox"
      className="relative px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-navy-50 hover:text-navy-700 transition-colors"
    >
      Inbox
      {count > 0 && (
        <span className={`absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold bg-red-500 text-white rounded-full leading-none${pulsing ? ' animate-pulse ring-2 ring-red-400' : ''}`}>
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  );
}
