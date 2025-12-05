'use client';

import * as React from 'react';
import { format, parse, isValid } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  placeholder = 'MM/DD/YYYY',
  disabled = false
}: DateInputProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  
  // Convert ISO date string to Date object
  const date = React.useMemo(() => {
    if (!value) return undefined;
    const parsed = parse(value, 'yyyy-MM-dd', new Date());
    return isValid(parsed) ? parsed : undefined;
  }, [value]);

  // Sync input value with prop value
  React.useEffect(() => {
    if (date) {
      setInputValue(format(date, 'MM/dd/yyyy'));
    } else {
      setInputValue('');
    }
  }, [date]);

  const handleSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      onChange?.(format(selectedDate, 'yyyy-MM-dd'));
    }
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    
    // Try to parse various date formats
    const formats = ['MM/dd/yyyy', 'M/d/yyyy', 'MM-dd-yyyy', 'M-d-yyyy', 'yyyy-MM-dd'];
    
    for (const fmt of formats) {
      const parsed = parse(newValue, fmt, new Date());
      if (isValid(parsed)) {
        onChange?.(format(parsed, 'yyyy-MM-dd'));
        return;
      }
    }
  };

  const handleInputBlur = () => {
    // On blur, if the value is invalid, reset to the current date or clear
    if (inputValue && !date) {
      setInputValue(date ? format(date, 'MM/dd/yyyy') : '');
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      inputRef.current?.blur();
    }
  };

  return (
    <div className={cn('relative flex items-center', className)}>
      {/* Text Input for typing date */}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        onKeyDown={handleInputKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'flex h-10 w-full rounded-md border px-3 py-2 text-sm pr-12',
          'bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400',
          'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
      />
      
      {/* Calendar Icon Button */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'absolute right-1 p-2 rounded-md',
              'text-slate-400 hover:text-white hover:bg-slate-600/50',
              'focus:outline-none focus:ring-2 focus:ring-emerald-500',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'touch-manipulation' // Better touch handling on mobile
            )}
            aria-label="Open calendar"
          >
            <CalendarIcon className="h-5 w-5 sm:h-5 sm:w-5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-slate-800 border-slate-700" align="end">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleSelect}
            initialFocus
            className="bg-slate-800"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
