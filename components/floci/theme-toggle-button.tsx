'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { STORAGE_KEYS } from '@/lib/floci/types';

type ThemeToggleButtonProps = {
  className?: string;
  iconOnly?: boolean;
};

function readStoredTheme(): 'light' | 'dark' {
  try {
    const value = window.localStorage.getItem(STORAGE_KEYS.theme);
    if (value === 'light' || value === 'dark') {
      return value;
    }
  } catch {
    // noop
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeToggleButton({ className, iconOnly = false }: ThemeToggleButtonProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    setTheme(readStoredTheme());
    setBootstrapped(true);
  }, []);

  useEffect(() => {
    if (!bootstrapped) return;

    document.documentElement.classList.toggle('dark', theme === 'dark');

    try {
      window.localStorage.setItem(STORAGE_KEYS.theme, theme);
    } catch {
      // noop
    }
  }, [bootstrapped, theme]);

  return (
    <Button
      variant='outline'
      className={className || 'w-full justify-start gap-2'}
      onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
    >
      {theme === 'dark' ? <Sun className='size-4' /> : <Moon className='size-4' />}
      {!iconOnly ? (theme === 'dark' ? 'Light Mode' : 'Dark Mode') : null}
    </Button>
  );
}
