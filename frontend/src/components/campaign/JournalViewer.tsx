/**
 * Journal Viewer
 * Read-only view for journal entries
 */

import { useState } from 'react';
import { Edit2, Eye, Lock, Users, Globe, Copy, Download } from 'lucide-react';
import Button from '@/components/ui/Button';
import { format } from 'date-fns';
import type { JournalEntry, JournalVisibility, JournalImage } from '@/types';

interface JournalViewerProps {
  entry: JournalEntry;
  canEdit: boolean;
  onEdit?: () => void;
}

const VISIBILITY_ICONS: Record<JournalVisibility, React.ReactNode> = {
  PUBLIC: <Globe className="w-3.5 h-3.5" />,
  DM_ONLY: <Lock className="w-3.5 h-3.5" />,
  PLAYER_SPECIFIC: <Users className="w-3.5 h-3.5" />,
};

const VISIBILITY_LABELS: Record<JournalVisibility, string> = {
  PUBLIC: 'Public',
  DM_ONLY: 'DM Only',
  PLAYER_SPECIFIC: 'Specific Players',
};

const VISIBILITY_COLORS: Record<JournalVisibility, string> = {
  PUBLIC: 'bg-moss-green/10 text-moss-green',
  DM_ONLY: 'bg-blue-600/10 text-blue-600',
  PLAYER_SPECIFIC: 'bg-purple-600/10 text-purple-600',
};

export default function JournalViewer({ entry, canEdit, onEdit }: JournalViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyHtml = async () => {
    try {
      await navigator.clipboard.writeText(entry.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = entry.content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = async () => {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${entry.title}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }
    h1, h2, h3 { color: #1f2937; }
    pre { background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
    code { background: #f3f4f6; padding: 0.2rem 0.4rem; border-radius: 0.25rem; }
    blockquote { border-left: 4px solid #e5e7eb; padding-left: 1rem; margin: 1rem 0; color: #6b7280; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #d1d5db; padding: 0.5rem; }
    th { background: #f3f4f6; }
    img { max-width: 100%; height: auto; }
    .task-list-item { list-style: none; }
    .task-list-item input[type="checkbox"] { margin-right: 0.5rem; }
  </style>
</head>
<body>
  <h1>${entry.title}</h1>
  <p style="color: #6b7280; font-size: 0.875rem;">${entry.visibility} · Updated ${format(new Date(entry.updatedAt), 'PPp')}</p>
  <hr>
  ${entry.content}
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${entry.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="prose prose-sm max-w-none p-4 min-h-[400px]">
      {/* Header with metadata */}
      <div className="mb-6 pb-4 border-b border-warm-amber/20">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            {VISIBILITY_ICONS[entry.visibility]}
            <span className={`px-2 py-1 rounded text-xs font-medium ${VISIBILITY_COLORS[entry.visibility]}`}>
              {VISIBILITY_LABELS[entry.visibility]}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleCopyHtml}>
              {copied ? <Eye className="w-3.5 h-3.5 text-moss-green" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDownload}>
              <Download className="w-3.5 h-3.5" />
            </Button>
            {canEdit && onEdit && (
              <Button variant="ghost" size="sm" onClick={onEdit}>
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-gray">
          <span>Created: {format(new Date(entry.createdAt), 'PPp')}</span>
          {entry.updatedAt !== entry.createdAt && (
            <>
              <span>·</span>
              <span>Updated: {format(new Date(entry.updatedAt), 'PPp')}</span>
            </>
          )}
          {entry.createdBy && (
            <>
              <span>·</span>
              <span>By: {entry.createdBy.displayName}</span>
            </>
          )}
        </div>

        {entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {entry.tags.map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded text-[10px] bg-parchment/50 text-stone-gray border border-warm-amber/20">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: entry.content }} />

      {/* Images */}
      {entry.images && entry.images.length > 0 && (
        <div className="mt-8 pt-6 border-t border-warm-amber/20">
          <h3 className="text-sm font-semibold text-brand-ink mb-3">Images</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {entry.images.map((image: JournalImage) => (
              <div key={image.id} className="rounded-cozy border border-warm-amber/20 overflow-hidden bg-parchment/30">
                {image.asset?.filePath && (
                  <img
                    src={`/api/assets/${image.asset.id}`}
                    alt={image.caption || 'Journal image'}
                    className="w-full h-48 object-cover"
                    loading="lazy"
                  />
                )}
                {(image.caption || image.asset?.originalName) && (
                  <div className="p-3">
                    {image.caption && (
                      <p className="text-sm text-brand-ink font-medium">{image.caption}</p>
                    )}
                    {image.asset?.originalName && (
                      <p className="text-[11px] text-stone-gray">{image.asset.originalName}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}