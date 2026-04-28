'use client';

import { type ReactNode, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type CreateResourceDialogProps = {
  open: boolean;
  title: string;
  description: string;
  label: string;
  placeholder: string;
  confirmLabel: string;
  submitting?: boolean;
  initialValue?: string;
  errorMessage?: string;
  submitDisabled?: boolean;
  children?: ReactNode;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: string) => Promise<void> | void;
};

export function CreateResourceDialog({
  open,
  title,
  description,
  label,
  placeholder,
  confirmLabel,
  submitting = false,
  initialValue = '',
  errorMessage,
  submitDisabled = false,
  children,
  onOpenChange,
  onSubmit,
}: CreateResourceDialogProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
    }
  }, [initialValue, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className='grid gap-2'>
          <label className='text-sm font-medium'>{label}</label>
          <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} autoFocus />
          {errorMessage ? <p className='text-xs text-destructive'>{errorMessage}</p> : null}
        </div>
        {children ? <div className='mt-3'>{children}</div> : null}

        <DialogFooter className='mt-4 border-t pt-4'>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit(value)} disabled={submitting || !value.trim() || submitDisabled}>
            {submitting ? 'Creating...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
