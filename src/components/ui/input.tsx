import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type InputProps = InputHTMLAttributes<HTMLInputElement>

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'flex h-10 w-full rounded-xl border border-white/8 bg-white/[0.04] px-4 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-white/15',
        className,
      )}
      {...props}
    />
  )
}
