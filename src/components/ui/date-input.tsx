'use client';

import * as React from 'react';
import { format, parse, isValid } from 'date-fns';
import { cn } from '@/lib/utils';

interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value?: string; // ISO format: yyyy-MM-dd
  onChange?: (value: string) => void;
}

export function DateInput({ value, onChange, className, ...props }: DateInputProps) {
  // Convert ISO date to display format (MM/dd/yyyy)
  const displayValue = React.useMemo(() => {
    if (!value) return '';
    const date = parse(value, 'yyyy-MM-dd', new Date());
    return isValid(date) ? format(date, 'MM/dd/yyyy') : '';
  }, [value]);

  const [inputValue, setInputValue] = React.useState(displayValue);

  // Sync when value prop changes
  React.useEffect(() => {
    setInputValue(displayValue);
  }, [displayValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    
    // Auto-format as user types
    const digits = raw.replace(/\D/g, '');
    let formatted = '';
    
    if (digits.length > 0) {
      formatted = digits.slice(0, 2);
    }
    if (digits.length > 2) {
      formatted += '/' + digits.slice(2, 4);
    }
    if (digits.length > 4) {
      formatted += '/' + digits.slice(4, 8);
    }
    
    setInputValue(formatted);

    // Parse and emit ISO format when complete
    if (digits.length === 8) {
      const parsed = parse(formatted, 'MM/dd/yyyy', new Date());
      if (isValid(parsed)) {
        onChange?.(format(parsed, 'yyyy-MM-dd'));
      }
    }
  };

  const handleBlur = () => {
    // Try to parse on blur
    if (inputValue) {
      const parsed = parse(inputValue, 'MM/dd/yyyy', new Date());
      if (isValid(parsed)) {
        onChange?.(format(parsed, 'yyyy-MM-dd'));
        setInputValue(format(parsed, 'MM/dd/yyyy'));
      } else {
        // Reset to last valid value
        setInputValue(displayValue);
      }
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="MM/DD/YYYY"
      value={inputValue}
      onChange={handleChange}
      onBlur={handleBlur}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}
