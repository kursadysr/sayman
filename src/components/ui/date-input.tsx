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
  const [isEditing, setIsEditing] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  
  // Convert ISO date string to Date object
  const date = React.useMemo(() => {
    if (!value) return undefined;
    const parsed = parse(value, 'yyyy-MM-dd', new Date());
    return isValid(parsed) ? parsed : undefined;
  }, [value]);

  // Sync input value with prop value (only when not actively editing)
  React.useEffect(() => {
    if (!isEditing) {
      if (date) {
        setInputValue(format(date, 'MM/dd/yyyy'));
      } else if (!value) {
        setInputValue('');
      }
    }
  }, [date, value, isEditing]);

  const handleSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      onChange?.(format(selectedDate, 'yyyy-MM-dd'));
    }
    setOpen(false);
  };

  // Check if date string looks complete (has full year)
  const isCompleteDateString = (str: string): boolean => {
    // Check for formats like MM/DD/YYYY or M/D/YYYY (with 4-digit year)
    const patterns = [
      /^\d{1,2}\/\d{1,2}\/\d{4}$/, // M/D/YYYY or MM/DD/YYYY
      /^\d{1,2}-\d{1,2}-\d{4}$/,   // M-D-YYYY or MM-DD-YYYY
      /^\d{4}-\d{1,2}-\d{1,2}$/,   // YYYY-MM-DD or YYYY-M-D
    ];
    return patterns.some(p => p.test(str));
  };

  // Validate year is reasonable (1900-2100)
  const isReasonableYear = (parsed: Date): boolean => {
    const year = parsed.getFullYear();
    return year >= 1900 && year <= 2100;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setIsEditing(true);
    
    // Only try to parse if it looks like a complete date
    if (!isCompleteDateString(newValue)) {
      return;
    }
    
    // Try to parse various date formats
    const formats = ['MM/dd/yyyy', 'M/d/yyyy', 'MM-dd-yyyy', 'M-d-yyyy', 'yyyy-MM-dd', 'yyyy-M-d'];
    
    for (const fmt of formats) {
      const parsed = parse(newValue, fmt, new Date());
      if (isValid(parsed) && isReasonableYear(parsed)) {
        onChange?.(format(parsed, 'yyyy-MM-dd'));
        return;
      }
    }
  };

  const handleInputFocus = () => {
    setIsEditing(true);
  };

  const handleInputBlur = () => {
    setIsEditing(false);
    
    // On blur, try to parse what user entered
    if (inputValue) {
      const formats = ['MM/dd/yyyy', 'M/d/yyyy', 'MM-dd-yyyy', 'M-d-yyyy', 'yyyy-MM-dd', 'yyyy-M-d'];
      
      for (const fmt of formats) {
        const parsed = parse(inputValue, fmt, new Date());
        if (isValid(parsed) && isReasonableYear(parsed)) {
          onChange?.(format(parsed, 'yyyy-MM-dd'));
          setInputValue(format(parsed, 'MM/dd/yyyy'));
          return;
        }
      }
      
      // If parsing failed, reset to previous valid date or clear
      if (date) {
        setInputValue(format(date, 'MM/dd/yyyy'));
      } else {
        setInputValue('');
      }
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
        onFocus={handleInputFocus}
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
              'touch-manipulation'
            )}
            aria-label="Open calendar"
          >
            <CalendarIcon className="h-5 w-5" />
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
