'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'flex flex-col gap-4',
        month_caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-sm font-medium text-slate-100',
        nav: 'flex items-center gap-1',
        button_previous: cn(
          buttonVariants({ variant: 'outline' }),
          'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 border-slate-600 absolute left-1'
        ),
        button_next: cn(
          buttonVariants({ variant: 'outline' }),
          'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 border-slate-600 absolute right-1'
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'text-slate-400 rounded-md w-9 font-normal text-[0.8rem] text-center',
        week: 'flex w-full mt-2',
        day: 'h-9 w-9 text-center text-sm p-0 relative',
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-9 w-9 p-0 font-normal aria-selected:opacity-100 text-slate-100 hover:bg-slate-700 hover:text-slate-100'
        ),
        selected: 'bg-emerald-500 text-white hover:bg-emerald-600 hover:text-white focus:bg-emerald-500 focus:text-white rounded-md',
        today: 'bg-slate-700 text-slate-100 rounded-md',
        outside: 'text-slate-500 aria-selected:bg-slate-700/50 aria-selected:text-slate-400',
        disabled: 'text-slate-500 opacity-50',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => {
          if (orientation === 'left') {
            return <ChevronLeft className="h-4 w-4" />;
          }
          return <ChevronRight className="h-4 w-4" />;
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };


