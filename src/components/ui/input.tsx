import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type InputProps = InputHTMLAttributes<HTMLInputElement>

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'flex h-10 w-full rounded-lg border border-[#2a2a2e] bg-[#1a1a1c] px-4 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus-visible:border-[#6366f1] focus-visible:ring-2 focus-visible:ring-[#6366f1]/20',
        className,
      )}
      {...props}
    />
  )
}
