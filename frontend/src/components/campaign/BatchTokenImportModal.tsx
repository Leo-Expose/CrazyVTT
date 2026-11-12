import React, { useState } from 'react';
import { Download, Upload, Shield, X, Check, Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';

export interface BatchTokenImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportStarterTokens: () => Promise<void>;
  onBatchUploadImages: (files: FileList) => Promise<void>;
}

export const BatchTokenImportModal: React.FC<BatchTokenImportModalProps> = ({
  isOpen,
  onClose,
  onImportStarterTokens,
  onBatchUploadImages,
}) => {
  if (!isOpen) return null;

  const [loadingStarter, setLoadingStarter] = useState(false);
  const [uploadingBatch, setUploadingBatch] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleStarter = async () => {
    setLoadingStarter(true);
    setSuccessMsg(null);
    try {
      await onImportStarterTokens();
      setSuccessMsg('Successfully loaded all standard starter hero & monster tokens!');
    } catch {
      setSuccessMsg('Failed to import starter tokens.');
    } finally {
      setLoadingStarter(false);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setUploadingBatch(true);
    setSuccessMsg(null);
    try {
      await onBatchUploadImages(e.target.files);
      setSuccessMsg(`Successfully imported ${e.target.files.length} custom token images!`);
    } catch {
      setSuccessMsg('Failed to batch upload token images.');
    } finally {
      setUploadingBatch(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
      <div className="bg-surface text-ink border border-edge rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 animate-scale-in">
        <div className="flex items-center justify-between border-b border-edge pb-3">
          <div className="flex items-center gap-2.5">
            <Download className="w-6 h-6 text-brand" />
            <div>
              <h3 className="font-bold text-base">Token Importer &amp; Starter Bundle</h3>
              <p className="text-xs text-ink-muted">Seed built-in clean vector tokens or mass import custom token pictures.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-light"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {successMsg && (
          <div className="p-3 bg-brand/10 border border-brand/30 rounded-xl text-xs text-brand font-medium flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            {successMsg}
          </div>
        )}

        <div className="space-y-4">
          {/* Option 1: 1-Click Starter Bundle */}
          <div className="p-4 bg-surface-light border border-edge rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">Free Starter Vector Token Pack</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand/15 text-brand font-medium">8 Tokens</span>
            </div>
            <p className="text-xs text-ink-muted leading-relaxed">
              Don&rsquo;t have token art? Load standard, clean minimalist SVG vector tokens (zero AI art): Fighter, Wizard, Rogue, Cleric, Goblin, Skeleton, Dragon, and Beast.
            </p>
            <div className="pt-2">
              <Button
                onClick={handleStarter}
                disabled={loadingStarter}
                className="w-full text-xs py-2"
              >
                {loadingStarter ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Loading Starter Pack...
                  </>
                ) : (
                  <>
                    <Shield className="w-3.5 h-3.5 mr-1.5" /> 1-Click Seed Starter Tokens
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Option 2: Mass File Upload */}
          <div className="p-4 bg-surface-light border border-edge rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">Mass / Batch Token Upload</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-ink/10 text-ink-muted font-medium">PNG / WEBP / SVG</span>
            </div>
            <p className="text-xs text-ink-muted leading-relaxed">
              Select multiple token images at once from your computer. Each file will be automatically imported as a ready-to-use token template.
            </p>
            <label className="cursor-pointer w-full flex items-center justify-center gap-2 py-2 px-3 border border-dashed border-edge-strong hover:border-brand rounded-xl bg-surface text-xs font-semibold text-ink transition-colors">
              <Upload className="w-3.5 h-3.5 text-brand" />
              {uploadingBatch ? 'Uploading...' : 'Choose Multiple Files...'}
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleFileInput}
                disabled={uploadingBatch}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-edge">
          <Button variant="secondary" onClick={onClose} className="text-xs py-1.5 px-4">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
};
