import React from 'react';
import { AlertTriangle, Target, Heart, Shield, Sparkles, Zap, Info, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from '@/components/ui/Modal';
import type { AttackPreview } from '@/types';

interface AttackPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  preview: AttackPreview | null;
  loading?: boolean;
  onRoll?: () => void;
  onCancel?: () => void;
  title?: string;
}

export default function AttackPreviewModal({ 
  isOpen, 
  onClose, 
  preview, 
  loading, 
  onRoll, 
  onCancel,
  title = 'Action Preview'
}: AttackPreviewModalProps) {
  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <div className="flex gap-2 w-full">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-3 py-2 rounded-md border border-ink-muted/30 bg-paper/50 hover:bg-paper/70 text-ink font-medium text-sm"
            >
              Cancel
            </button>
          )}
          {onRoll && (
            <button
              type="button"
              onClick={onRoll}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-success/15 hover:bg-success/25 border border-success/30 text-success-ink font-semibold text-sm shadow-xs disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Rolling...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Roll</span>
                </>
              )}
            </button>
          )}
        </div>
      }
    >
      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center py-8"
          >
            <div className="flex flex-col items-center gap-3 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-brand-ink" />
              <p className="text-ink-secondary">Calculating preview...</p>
            </div>
          </motion.div>
        )}
        {!loading && preview && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {/* Description */}
            <div className="bg-paper/50 rounded-lg p-3 border border-ink-muted/10">
              <p className="text-sm text-ink font-mono leading-relaxed whitespace-pre-wrap">
                {preview.description}
              </p>
            </div>

            {/* Attack Roll */}
            {preview.attackRoll && preview.attackRoll.expression && (
              <PreviewSection title="Attack Roll" icon={<Target className="w-4 h-4" />} color="danger">
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-ink-secondary">Expression:</span>
                    <span className="text-ink font-bold">{preview.attackRoll.expression}</span>
                  </div>
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-ink-secondary">Breakdown:</span>
                    <span className="text-ink">{preview.attackRoll.breakdown}</span>
                  </div>
                  {preview.attackRoll.vsAC && (
                    <div className="flex items-center justify-between font-mono">
                      <span className="text-ink-secondary">vs AC:</span>
                      <span className="text-ink font-bold">{preview.attackRoll.vsAC}</span>
                    </div>
                  )}
                  {(preview.attackRoll.advantage || preview.attackRoll.disadvantage) && (
                    <div className="flex items-center gap-2">
                      <span className="text-ink-secondary text-xs">Mode:</span>
                      <span className={`px-2 py-0.5 text-xs rounded ${
                        preview.attackRoll.advantage 
                          ? 'bg-success/15 text-success-ink' 
                          : 'bg-warning/15 text-warning-ink'
                      }`}>
                        {preview.attackRoll.advantage ? 'Advantage' : 'Disadvantage'}
                      </span>
                    </div>
                  )}
                </div>
              </PreviewSection>
            )}

            {/* Damage Roll */}
            {preview.damageRoll && (
              <PreviewSection title="Damage" icon={<Heart className="w-4 h-4" />} color="danger">
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-ink-secondary">Expression:</span>
                    <span className="text-ink font-bold">{preview.damageRoll.expression}</span>
                  </div>
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-ink-secondary">Breakdown:</span>
                    <span className="text-ink">{preview.damageRoll.breakdown}</span>
                  </div>
                  {preview.damageRoll.damageType && (
                    <div className="flex items-center justify-between">
                      <span className="text-ink-secondary">Type:</span>
                      <span className="text-ink capitalize font-medium">{preview.damageRoll.damageType}</span>
                    </div>
                  )}
                </div>
              </PreviewSection>
            )}

            {/* Save DC */}
            {preview.saveDC && (
              <PreviewSection title="Saving Throw" icon={<Shield className="w-4 h-4" />} color="spirit">
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-ink-secondary">Ability:</span>
                    <span className="text-ink capitalize">{preview.saveDC.ability}</span>
                  </div>
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-ink-secondary">DC:</span>
                    <span className="text-ink font-bold">{preview.saveDC.dc}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-secondary">On Success:</span>
                    <span className="text-ink">
                      {preview.saveDC.halfOnSuccess ? 'Half damage' : 'Full damage'}
                    </span>
                  </div>
                </div>
              </PreviewSection>
            )}

            {/* Area of Effect */}
            {preview.area && (
              <PreviewSection title="Area of Effect" icon={<Zap className="w-4 h-4" />} color="warning">
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-secondary">Shape:</span>
                    <span className="text-ink capitalize">{preview.area.shape}</span>
                  </div>
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-ink-secondary">Size:</span>
                    <span className="text-ink">{preview.area.size} {preview.area.units}</span>
                  </div>
                </div>
              </PreviewSection>
            )}

            {/* Range */}
            {preview.range && (
              <PreviewSection title="Range" icon={<Info className="w-4 h-4" />} color="info">
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-ink-secondary">Normal:</span>
                    <span className="text-ink">{preview.range.normal} {preview.range.units}</span>
                  </div>
                  {preview.range.long && (
                    <div className="flex items-center justify-between font-mono">
                      <span className="text-ink-secondary">Long:</span>
                      <span className="text-ink">{preview.range.long} {preview.range.units}</span>
                    </div>
                  )}
                </div>
              </PreviewSection>
            )}

            {/* Resource Cost */}
            {preview.resourceCost && preview.resourceCost.length > 0 && (
              <PreviewSection title="Resource Cost" icon={<Sparkles className="w-4 h-4" />} color="accent">
                <div className="space-y-1 text-sm">
                  {preview.resourceCost.map((resource, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-ink-secondary">{resource.type.replace('_', ' ')}:</span>
                      <span className="text-ink font-medium">{resource.details} ×{resource.amount}</span>
                    </div>
                  ))}
                </div>
              </PreviewSection>
            )}

            {/* Conditions */}
            {preview.conditions && preview.conditions.length > 0 && (
              <PreviewSection title="Conditions Applied" icon={<AlertTriangle className="w-4 h-4" />} color="warning">
                <div className="space-y-1 text-sm">
                  {preview.conditions.map((condition, i) => (
                    <div key={i} className="bg-warning/5 border border-warning/20 rounded p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-warning-ink">{condition.name}</span>
                        <span className="text-xs text-ink-muted">{condition.duration}</span>
                      </div>
                      <div className="text-xs text-ink-secondary">
                        {condition.saveEnds ? `Save ends (DC ${condition.saveDC})` : 'No save'}
                      </div>
                    </div>
                  ))}
                </div>
              </PreviewSection>
            )}

            {/* Warnings */}
            {preview.warnings && preview.warnings.length > 0 && (
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning-ink shrink-0 mt-0.5" />
                  <div className="flex-1 text-sm text-warning-ink space-y-1">
                    {preview.warnings.map((warning, i) => (
                      <p key={i} className="flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-current" />
                        {warning}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
        {!loading && !preview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center py-8 text-center"
          >
            <Info className="w-8 h-8 text-ink-muted/30 mb-2" />
            <p className="text-ink-secondary">No preview available</p>
            <p className="text-xs text-ink-muted mt-1">Select an action to see its preview</p>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}

interface PreviewSectionProps {
  title: string;
  icon: React.ReactNode;
  color: 'danger' | 'spirit' | 'warning' | 'info' | 'accent';
  children: React.ReactNode;
}

const COLOR_CLASSES: Record<PreviewSectionProps['color'], string> = {
  danger: 'border-danger/20 bg-danger/5',
  spirit: 'border-spirit/20 bg-spirit/5',
  warning: 'border-warning/20 bg-warning/5',
  info: 'border-info/20 bg-info/5',
  accent: 'border-accent/20 bg-accent/5',
};

const ICON_CLASSES: Record<PreviewSectionProps['color'], string> = {
  danger: 'text-danger-ink',
  spirit: 'text-spirit-ink',
  warning: 'text-warning-ink',
  info: 'text-info-ink',
  accent: 'text-accent-ink',
};

function PreviewSection({ title, icon, color, children }: PreviewSectionProps) {
  return (
    <div className={`rounded-lg p-3 ${COLOR_CLASSES[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={ICON_CLASSES[color]}>{icon}</span>
        <h4 className="text-sm font-semibold text-ink">{title}</h4>
      </div>
      <div className="ml-6">{children}</div>
    </div>
  );
}