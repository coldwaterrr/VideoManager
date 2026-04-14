import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type InputProps = InputHTMLAttributes<HTMLInputElement>

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'flex h-10 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus-visible:border-violet-500 focus-visible:ring-2 focus-visible:ring-violet-500/20',
        className,
      )}
      {...props}
    />
  )
}
