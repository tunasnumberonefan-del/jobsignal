import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './button';

export function Dialog({ open, onOpenChange, title, description, children, footer, wide }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/45 anim-rise" />
        <D.Content
          className={`fixed left-1/2 top-[8vh] z-50 w-[calc(100vw-24px)] ${wide ? 'max-w-[640px]' : 'max-w-[460px]'} -translate-x-1/2 panel p-6 anim-rise max-h-[84vh] overflow-y-auto`}
        >
          <div className="flex items-start justify-between gap-4">
            <D.Title className="font-serif text-[24px] leading-tight text-ink">{title}</D.Title>
            <D.Close className="-mr-2 -mt-1 rounded p-1.5 text-muted hover:text-ink hover:bg-bg-sunk" aria-label="Close">
              <X className="size-4.5" />
            </D.Close>
          </div>
          {description ? <D.Description className="mt-2 text-[14.5px] text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          {children && <div className="mt-5">{children}</div>}
          {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, danger, loading }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    />
  );
}
