'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Rocket, User } from 'lucide-react';

const items = [
  {
    title: 'Account',
    href: '/settings',
    icon: User,
  },
  {
    title: 'Operation',
    href: '/settings/operation',
    icon: Rocket,
  },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-6 h-[8.5rem]">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
        return (
          <Link key={item.href} href={item.href}>
            <Button
              variant="ghost"
              className={cn(
                'gap-2',
                isActive &&
                  'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-600',
              )}
            >
              <Icon size={24} />
              {item.title}
            </Button>
          </Link>
        );
      })}
    </div>
  );
}
