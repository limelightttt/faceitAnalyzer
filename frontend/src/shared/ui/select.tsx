import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'

import { cn } from '@/shared/lib/cn'

export interface Option {
  value: string
  label: string
}

export function Select({
  value,
  onChange,
  options,
  className,
  label,
}: {
  value: string
  onChange: (v: string) => void
  options: Option[]
  className?: string
  label: string
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange}>
      <SelectPrimitive.Trigger
        aria-label={label}
        className={cn(
          'inline-flex h-8 items-center justify-between gap-2 rounded-lg border bg-card px-3 text-xs transition-colors hover:bg-card-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <SelectPrimitive.Value />
        <ChevronDown className="size-3.5 opacity-60" />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={4} className="popover-motion z-50 max-h-72 min-w-36 overflow-hidden rounded-lg border bg-card shadow-lg">
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer items-center rounded-md py-1.5 pr-2 pl-7 text-xs outline-none select-none transition-colors data-[highlighted]:bg-card-2"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2">
                  <Check className="size-3.5" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
