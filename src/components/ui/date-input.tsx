'use client';

import * as React from 'react';
import { format, parse, isValid } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface DateInputProps {
  value?: string; // ISO format: yyyy-MM-dd
  onChange?: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function DateInput({ 
  value, 
  onChange, 
  className,
  placeholder = 'Pick a date',
  disabled = false
}: DateInputProps) {
  const [open, setOpen] = React.useState(false);
  
  // Convert ISO date string to Date object
  const date = React.useMemo(() => {
    if (!value) return undefined;
    const parsed = parse(value, 'yyyy-MM-dd', new Date());
    return isValid(parsed) ? parsed : undefined;
  }, [value]);

  const handleSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      onChange?.(format(selectedDate, 'yyyy-MM-dd'));
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal',
            'bg-slate-700/50 border-slate-600 text-white hover:bg-slate-700 hover:text-white',
            !date && 'text-slate-400',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, 'MM/dd/yyyy') : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
