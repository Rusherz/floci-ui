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
  submittingLabel?: string;
  submitting?: boolean;
  initialValue?: string;
  inputDisabled?: boolean;
  errorMessage?: string;
  submitDisabled?: boolean;
  allowEmptySubmit?: boolean;
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
  submittingLabel = 'Creating...',
  submitting = false,
  initialValue = '',
  inputDisabled = false,
  errorMessage,
  submitDisabled = false,
  allowEmptySubmit = false,
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
      <DialogContent className='max-h-[90vh] w-[95vw] max-w-[95vw] overflow-y-auto md:w-[50vw] md:max-w-[50vw]'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className='grid gap-2'>
          <label className='text-sm font-medium'>{label}</label>
          <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} autoFocus disabled={inputDisabled} />
          {errorMessage ? <p className='text-xs text-destructive'>{errorMessage}</p> : null}
        </div>
        {children ? <div className='mt-3'>{children}</div> : null}

        <DialogFooter className='mt-4 border-t pt-4'>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit(value)} disabled={submitting || (!allowEmptySubmit && !value.trim()) || submitDisabled}>
            {submitting ? submittingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
