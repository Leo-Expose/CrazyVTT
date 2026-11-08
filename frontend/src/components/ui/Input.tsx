/* eslint-disable @typescript-eslint/no-explicit-any -- this compatibility primitive accepts both event and value callbacks. */
// ============================================
// Input / Textarea / Select — shared form control primitives
//
// All three emit the `.input-cozy` style (theme-token driven) plus the
// standard disabled treatment, so migrating raw `className="input-cozy …"`
// elements is visually a no-op. Pair with <Field> for label + hint + error.
// ============================================

import { forwardRef } from 'react';
import { cn } from '@/utils/cn';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  /** Marks the control invalid (red ring) — set automatically inside <Field error>. */
  invalid?: boolean;
  label?: string;
  multiline?: boolean;
  rows?: number;
  onChange?: (value: any) => void;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, label, multiline, rows, onChange, ...rest },
  ref
) {
  const classes = cn('input-cozy w-full disabled:opacity-50 disabled:cursor-not-allowed', invalid && 'ring-2 ring-danger/60 border-transparent', className);
  const control = multiline ? (
    <textarea ref={ref as React.Ref<HTMLTextAreaElement>} rows={rows} aria-invalid={invalid || undefined} className={`${classes} resize-none`} {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} onChange={(event) => onChange?.(event.target.value)} />
  ) : (
    <input ref={ref} aria-invalid={invalid || undefined} className={classes} {...rest} onChange={(event) => onChange?.(label ? event.target.value : event)} />
  );
  return label ? <label className="block space-y-1"><span className="text-sm font-medium text-ink">{label}</span>{control}</label> : control;
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...rest },
  ref
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'input-cozy w-full resize-none disabled:opacity-50 disabled:cursor-not-allowed',
        invalid && 'ring-2 ring-danger/60 border-transparent',
        className
      )}
      {...rest}
    />
  );
});

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'children'> {
  invalid?: boolean;
  label?: string;
  options?: { value: string; label: string }[];
  children?: React.ReactNode;
  onChange?: (value: any) => void;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, label, options, children, onChange, ...rest },
  ref
) {
  const control = (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'input-cozy w-full disabled:opacity-50 disabled:cursor-not-allowed',
        invalid && 'ring-2 ring-danger/60 border-transparent',
        className
      )}
      onChange={(event) => onChange?.(label ? event.target.value : event)}
      {...rest}
    >
      {options ? options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>) : children}
    </select>
  );
  return label ? <label className="block space-y-1"><span className="text-sm font-medium text-ink">{label}</span>{control}</label> : control;
});
