import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366f1]/50 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white hover:shadow-[0_4px_16px_rgba(99,102,241,0.4)] hover:-translate-y-0.5 active:translate-y-0',
        secondary: 'bg-[#1e1e20] text-zinc-300 border border-[#2a2a2e] hover:bg-[#2a2a2e] hover:text-white hover:border-[#3a3a3e]',
        ghost: 'bg-transparent text-zinc-400 hover:bg-[#1e1e20] hover:text-white',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        lg: 'h-11 px-5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
