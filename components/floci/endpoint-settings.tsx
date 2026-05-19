'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FLOCI_ENDPOINT_COOKIE, FLOCI_ENDPOINT_FALLBACK, isValidEndpointUrl } from '@/lib/floci/endpoint';

const FIRST_LAUNCH_KEY = 'floci_first_launch_seen';

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function EndpointSettings({ inline = false }: { inline?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(FLOCI_ENDPOINT_FALLBACK);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const existing = getCookie(FLOCI_ENDPOINT_COOKIE);
    if (existing) setValue(existing);
  }, []);

  const save = () => {
    const trimmed = value.trim();
    if (!isValidEndpointUrl(trimmed)) {
      setError('Enter a full http(s) URL.');
      return;
    }
    setError(null);
    document.cookie = `${FLOCI_ENDPOINT_COOKIE}=${encodeURIComponent(trimmed)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    localStorage.setItem(FIRST_LAUNCH_KEY, '1');
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
    router.refresh();
  };

  return (
    <div className={inline ? 'rounded-md border p-3' : 'space-y-4'}>
      <p className='text-sm font-medium'>Upstream endpoint</p>
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={FLOCI_ENDPOINT_FALLBACK} />
      {error ? <p className='text-xs text-destructive'>{error}</p> : null}
      <div className='flex items-center gap-2'>
        <Button onClick={save}>Save</Button>
        {saved ? <span className='text-xs text-muted-foreground'>Saved</span> : null}
      </div>
    </div>
  );
}

export function FirstLaunchEndpointPrompt() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [value, setValue] = useState(FLOCI_ENDPOINT_FALLBACK);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const seen = localStorage.getItem(FIRST_LAUNCH_KEY);
    if (!seen) {
      const existing = getCookie(FLOCI_ENDPOINT_COOKIE);
      if (existing) setValue(existing);
      setShow(true);
    }
  }, []);

  const complete = (endpoint: string) => {
    document.cookie = `${FLOCI_ENDPOINT_COOKIE}=${encodeURIComponent(endpoint)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    localStorage.setItem(FIRST_LAUNCH_KEY, '1');
    setShow(false);
    router.refresh();
  };

  const onSave = () => {
    const trimmed = value.trim();
    if (!isValidEndpointUrl(trimmed)) {
      setError('Enter a full http(s) URL.');
      return;
    }
    setError(null);
    complete(trimmed);
  };

  return (
    <Dialog open={show}>
      <DialogContent className='sm:max-w-lg' onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Set Floci endpoint</DialogTitle>
          <DialogDescription>Choose where the console should send proxy requests.</DialogDescription>
        </DialogHeader>
        <div className='space-y-2'>
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={FLOCI_ENDPOINT_FALLBACK} />
          {error ? <p className='text-xs text-destructive'>{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => complete(FLOCI_ENDPOINT_FALLBACK)}>Use default localhost</Button>
          <Button onClick={onSave}>Save endpoint</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
