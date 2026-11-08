// ============================================
// RulebookUploader
// DM-only component for uploading rulebook PDFs/EPUBs
// ============================================

import { useState, useCallback } from 'react';
import { Upload, FileText, X, AlertTriangle } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import api from '@/services/api';
import { apiErrorMessage } from '@/utils/errors';
import Button from '@/components/ui/Button';
import { Rulebook } from '@/types';

interface RulebookUploaderProps {
  campaignId: string;
  onUploadComplete?: (rulebook: Rulebook) => void;
  onClose?: () => void;
}

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

export default function RulebookUploader({
  campaignId,
  onUploadComplete,
  onClose,
}: RulebookUploaderProps) {
  const { showToast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [title, setTitle] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [edition, setEdition] = useState('5e');
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'epub'].includes(ext || '')) {
      setError('Only PDF and EPUB files are allowed');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError('File must be smaller than 500MB');
      return;
    }

    setError(null);
    setSelectedFile(file);

    // Auto-fill title from filename
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    if (!title) setTitle(nameWithoutExt);
    if (!sourceId) setSourceId(nameWithoutExt.toLowerCase().replace(/[^a-z0-9]/g, '-'));
  }, [title, sourceId]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);


  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const removeFile = () => {
    setSelectedFile(null);
    setTitle('');
    setSourceId('');
    setEdition('5e');
    setError(null);
  };

  const validateForm = (): boolean => {
    if (!selectedFile) {
      setError('Please select a PDF or EPUB file');
      return false;
    }
    if (!title.trim()) {
      setError('Title is required');
      return false;
    }
    if (!sourceId.trim()) {
      setError('Source ID is required');
      return false;
    }
    if (!edition.trim()) {
      setError('Edition is required');
      return false;
    }
    return true;
  };

  const handleUpload = async () => {
    if (!validateForm()) return;

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      const result = await api.uploadRulebook(
        selectedFile!,
        { title: title.trim(), sourceId: sourceId.trim(), edition: edition.trim(), campaignId },
        setUploadProgress
      );

      showToast(`Rulebook "${result.rulebook.title}" uploaded successfully`, 'success');
      onUploadComplete?.(result.rulebook);
      onClose?.();
    } catch (err) {
      const message = apiErrorMessage(err) ?? 'Failed to upload rulebook';
      setError(message);
      showToast(message, 'error');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };


  return (
    <div className="bg-paper rounded-xl border border-ink/10 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-ink">Upload Rulebook</h3>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Drop Zone */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? 'border-brand bg-brand/5'
            : 'border-ink/10 hover:border-brand/50'
        } ${selectedFile ? 'border-brand bg-brand/5' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".pdf,.epub"
          onChange={handleFileInputChange}
          className="absolute inset-0 opacity-0 cursor-pointer"
          disabled={uploading}
          id="rulebook-file-input"
        />

        {selectedFile ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-3 text-ink">
              <FileText className="w-8 h-8 text-brand-ink" />
              <div className="text-left">
                <p className="font-medium">{selectedFile.name}</p>
                <p className="text-sm text-ink-muted">
                  {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={removeFile}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Upload className="w-12 h-12 mx-auto text-ink-muted" />
            <p className="text-ink-muted">
              Drag & drop a PDF or EPUB file, or click to browse
            </p>
            <p className="text-sm text-ink-muted">Max size: 500 MB</p>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger-ink text-sm">
            <AlertTriangle className="w-4 h-4 inline mr-1" />
            {error}
          </div>
        )}
      </div>

      {/* Metadata Form */}
      {selectedFile && (
        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="rulebook-title" className="block text-sm font-medium text-ink mb-1">
              Title *
            </label>
            <input
              id="rulebook-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-canvas border border-ink/10 rounded-lg text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              placeholder="Player's Handbook (2024)"
              disabled={uploading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="rulebook-sourceId" className="block text-sm font-medium text-ink mb-1">
                Source ID *
              </label>
              <input
                id="rulebook-sourceId"
                type="text"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="w-full px-3 py-2 bg-canvas border border-ink/10 rounded-lg text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                placeholder="phb-2024"
                disabled={uploading}
              />
              <p className="mt-1 text-xs text-ink-muted">Lowercase, hyphens only (used for internal references)</p>
            </div>

            <div>
              <label htmlFor="rulebook-edition" className="block text-sm font-medium text-ink mb-1">
                Edition *
              </label>
              <select
                id="rulebook-edition"
                value={edition}
                onChange={(e) => setEdition(e.target.value)}
                className="w-full px-3 py-2 bg-canvas border border-ink/10 rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                disabled={uploading}
              >
                <option value="5e">D&D 5e (2014)</option>
                <option value="5.5e">D&D 5.5e (2024)</option>
                <option value="5.1">D&D 5.1 SRD</option>
                <option value="custom">Custom / Other</option>
              </select>
            </div>
          </div>

          {/* Upload Button */}
          <div className="flex justify-end gap-3 pt-4 border-t border-ink/10">
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleUpload}
              disabled={uploading}
              loading={uploading}
            >
              {uploading ? `Uploading... ${uploadProgress}%` : 'Upload Rulebook'}
            </Button>
          </div>

          {/* Upload Progress */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">Uploading...</span>
                <span className="text-ink">{uploadProgress}%</span>
              </div>
              <div className="h-2 bg-ink/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
