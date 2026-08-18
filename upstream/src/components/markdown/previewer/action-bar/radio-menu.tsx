import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface RadioMenuItem<TValue extends string> {
  id: TValue
  name: string
}

interface RadioMenuGroupProps<TValue extends string> {
  label: string
  items: readonly RadioMenuItem<TValue>[]
  value: TValue
  onValueChange: (value: TValue) => void
}

interface RadioDropdownMenuProps<TValue extends string> extends RadioMenuGroupProps<TValue> {
  icon: ReactNode
}

export function RadioMenuGroup<TValue extends string>({
  label,
  items,
  value,
  onValueChange,
}: RadioMenuGroupProps<TValue>) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuRadioGroup
        value={value}
        onValueChange={nextValue => onValueChange(nextValue as TValue)}
      >
        {items.map(item => (
          <DropdownMenuRadioItem
            key={item.id}
            value={item.id}
            className="cursor-pointer"
          >
            {item.name}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  )
}

export function RadioDropdownMenu<TValue extends string>({
  icon,
  label,
  items,
  value,
  onValueChange,
}: RadioDropdownMenuProps<TValue>) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={(
            <DropdownMenuTrigger
              render={(
                <Button variant="ghost" size="icon" aria-label={label}>
                  {icon}
                </Button>
              )}
            />
          )}
        />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-48">
        <RadioMenuGroup
          label={label}
          items={items}
          value={value}
          onValueChange={onValueChange}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
