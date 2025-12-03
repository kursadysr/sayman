'use client';

import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import type { Contact } from '@/lib/supabase/types';
import { toast } from 'sonner';

// Random phrases for deletion confirmation
const DELETION_PHRASES = [
  'delete forever',
  'remove permanently',
  'erase all data',
  'confirm deletion',
  'destroy records',
  'wipe everything',
  'no going back',
  'final goodbye',
  'permanent removal',
  'completely erase',
];

interface DeleteContactDialogProps {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DeleteContactDialog({
  contact,
  open,
  onOpenChange,
  onSuccess,
}: DeleteContactDialogProps) {
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [requiredPhrase, setRequiredPhrase] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Generate random phrase when dialog opens
  useEffect(() => {
    if (open) {
      const randomPhrase = DELETION_PHRASES[Math.floor(Math.random() * DELETION_PHRASES.length)];
      setRequiredPhrase(randomPhrase);
      setInputValue('');
      setConfirmPhrase('');
    }
  }, [open]);

  // Block paste, copy, cut via keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Block Ctrl+V, Ctrl+C, Ctrl+X, Ctrl+A
    if (e.ctrlKey || e.metaKey) {
      if (['v', 'c', 'x', 'a', 'V', 'C', 'X', 'A'].includes(e.key)) {
        e.preventDefault();
        return;
      }
    }
  };

  // Block paste via context menu
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
  };

  // Block copy via context menu
  const handleCopy = (e: React.ClipboardEvent) => {
    e.preventDefault();
  };

  // Block cut via context menu
  const handleCut = (e: React.ClipboardEvent) => {
    e.preventDefault();
  };

  // Block context menu entirely
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  // Block drag-drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow typing, block programmatic changes
    const newValue = e.target.value;
    // Prevent multiple characters being inserted at once (paste workaround)
    if (newValue.length > inputValue.length + 1) {
      return;
    }
    setInputValue(newValue);
    setConfirmPhrase(newValue);
  };

  const isConfirmed = confirmPhrase.toLowerCase() === requiredPhrase.toLowerCase();

  const handleDelete = async () => {
    if (!contact || !isConfirmed) return;

    setLoading(true);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', contact.id);

      if (error) throw error;

      toast.success(`${contact.name} has been permanently deleted`);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error deleting contact:', error);
      toast.error('Failed to delete contact');
    } finally {
      setLoading(false);
    }
  };

  if (!contact) return null;

  const typeLabel = contact.type === 'vendor' ? 'vendor' : contact.type === 'customer' ? 'customer' : 'employee';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Delete {contact.name}?
          </DialogTitle>
          <DialogDescription className="text-slate-400 space-y-2">
            <p>
              This action is <span className="text-red-400 font-semibold">permanent</span> and cannot be undone.
            </p>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Warning Box */}
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <h4 className="text-red-400 font-medium mb-2">The following will be deleted:</h4>
            <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
              {contact.type === 'vendor' && (
                <>
                  <li>All items linked to this vendor</li>
                  <li>Bills will show "Unknown Vendor"</li>
                </>
              )}
              {contact.type === 'customer' && (
                <li>Invoices will show "Unknown Customer"</li>
              )}
              {contact.type === 'employee' && (
                <>
                  <li>All timesheet records for this employee</li>
                  <li>All work history and payment records</li>
                </>
              )}
              <li>Contact information and balance history</li>
            </ul>
          </div>

          {/* Confirmation Input */}
          <div>
            <Label className="text-slate-300">
              Type <span className="font-mono bg-slate-700 px-2 py-0.5 rounded text-amber-400">{requiredPhrase}</span> to confirm:
            </Label>
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onCopy={handleCopy}
              onCut={handleCut}
              onContextMenu={handleContextMenu}
              onDrop={handleDrop}
              placeholder="Type the phrase above"
              className="mt-2 bg-slate-700/50 border-slate-600 text-white font-mono"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {inputValue && !isConfirmed && (
              <p className="text-red-400 text-sm mt-1">Phrase doesn't match</p>
            )}
            {isConfirmed && (
              <p className="text-emerald-400 text-sm mt-1">✓ Phrase confirmed</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-600 text-slate-300"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!isConfirmed || loading}
            className="bg-red-600 hover:bg-red-700"
          >
            {loading ? (
              'Deleting...'
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Permanently
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

