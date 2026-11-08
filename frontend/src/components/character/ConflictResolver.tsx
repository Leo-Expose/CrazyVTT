/**
 * Conflict Resolver Modal
 * Allows players to resolve conflicts on their character
 */

import { useState } from 'react';
import { AlertTriangle, Check, X, Flag, Info } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import type { CharacterConflict } from './DMReviewPanel';

interface ConflictResolverProps {
  conflict: CharacterConflict | null;
  onClose: () => void;
  onResolve: (conflictId: string, resolution: 'accept' | 'reject' | 'force') => Promise<void>;
}

export function ConflictResolver({
  conflict,
  onClose,
  onResolve,
}: ConflictResolverProps) {
  const [resolving, setResolving] = useState(false);

  if (!conflict) return null;

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'BLOCKING': return <AlertTriangle className="w-6 h-6 text-danger-ink" />;
      case 'ERROR': return <AlertTriangle className="w-6 h-6 text-danger-ink" />;
      case 'WARNING': return <AlertTriangle className="w-6 h-6 text-warning-ink" />;
      case 'INFO': return <Info className="w-6 h-6 text-info-ink" />;
      default: return <AlertTriangle className="w-6 h-6 text-stone-gray" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'BLOCKING': return 'bg-danger/20 text-danger-ink border-danger/30';
      case 'ERROR': return 'bg-danger/10 text-danger-ink border-danger/20';
      case 'WARNING': return 'bg-warning/20 text-warning-ink border-warning/30';
      case 'INFO': return 'bg-info/20 text-info-ink border-info/30';
      default: return 'bg-stone-gray/20 text-stone-gray border-stone-gray/30';
    }
  };

  const formatFieldPath = (path: string) => {
    return path.replace(/\.([a-zA-Z]+)/g, ' → $1').replace(/\[(\d+)\]/g, '[$1]');
  };

  const handleResolve = async (resolution: 'accept' | 'reject' | 'force') => {
    setResolving(true);
    try {
      await onResolve(conflict.id, resolution);
      onClose();
    } catch {
      console.error('Failed to resolve conflict');
    } finally {
      setResolving(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Resolve Conflict"
      size="md"
    >
      <div className="space-y-4">
        {/* Conflict Header */}
        <div className={`p-4 rounded-lg border ${getSeverityColor(conflict.severity)}`}>
          <div className="flex items-start gap-3">
            {getSeverityIcon(conflict.severity)}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-sm text-ink">{formatFieldPath(conflict.fieldPath)}</span>
                <span className={`px-2 py-0.5 text-xs rounded ${getSeverityColor(conflict.severity)}`}>
                  {conflict.severity}
                </span>
                <span className="px-2 py-0.5 text-xs rounded bg-ink/10 text-ink-muted">
                  {conflict.conflictType}
                </span>
              </div>
              <p className="text-ink-secondary">{conflict.description}</p>
            </div>
          </div>
        </div>

        {/* Resolution Options */}
        <div className="space-y-3">
          <p className="text-sm text-ink-secondary">
            How would you like to resolve this conflict?
          </p>

          <div className="grid grid-cols-3 gap-3">
            {/* Accept */}
            <Button
              variant="secondary"
              className="h-24 flex flex-col gap-2 p-4 border-2 border-success/30 hover:border-success hover:bg-success/5"
              onClick={() => handleResolve('accept')}
              disabled={resolving}
            >
              <Check className="w-6 h-6 text-success-ink mx-auto" />
              <span className="font-medium text-success-ink">Accept</span>
              <span className="text-xs text-ink-muted text-center">
                Apply the suggested change
              </span>
            </Button>

            {/* Reject */}
            <Button
              variant="secondary"
              className="h-24 flex flex-col gap-2 p-4 border-2 border-danger/30 hover:border-danger hover:bg-danger/5"
              onClick={() => handleResolve('reject')}
              disabled={resolving}
            >
              <X className="w-6 h-6 text-danger-ink mx-auto" />
              <span className="font-medium text-danger-ink">Reject</span>
              <span className="text-xs text-ink-muted text-center">
                Keep your current value
              </span>
            </Button>

            {/* Force */}
            <Button
              variant="secondary"
              className="h-24 flex flex-col gap-2 p-4 border-2 border-warning/30 hover:border-warning hover:bg-warning/5"
              onClick={() => handleResolve('force')}
              disabled={resolving}
            >
              <Flag className="w-6 h-6 text-warning-ink mx-auto" />
              <span className="font-medium text-warning-ink">Force</span>
              <span className="text-xs text-ink-muted text-center">
                Let the DM decide
              </span>
            </Button>
          </div>

          {/* Descriptions */}
          <div className="grid grid-cols-3 gap-3 text-xs text-ink-muted">
            <div className="text-center p-2 bg-success/5 rounded">
              Accepts the DM's suggested value for this field.
            </div>
            <div className="text-center p-2 bg-danger/5 rounded">
              Keeps your current value, dismissing the conflict.
            </div>
            <div className="text-center p-2 bg-warning/5 rounded">
              Escalates to the DM for a final decision.
            </div>
          </div>
        </div>

        {resolving && (
          <div className="flex items-center justify-center gap-2 text-ink-muted">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-brand border-t-transparent" />
            Resolving...
          </div>
        )}
      </div>
    </Modal>
  );
}

export default ConflictResolver;
