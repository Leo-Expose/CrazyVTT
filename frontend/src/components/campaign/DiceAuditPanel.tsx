import { useState, useCallback } from 'react';
import { BarChart2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useCampaign } from '@/contexts/CampaignContext';

// ---------------------------------------------------------------------------
// Types (mirrors the backend AuditResult shape but Maps serialised to objects)
// ---------------------------------------------------------------------------

type AuditRecommendation = 'PASS' | 'WARN' | 'FAIL';

interface SerializedAuditResult {
  expression: string;
  mode: string;
  valid: boolean;
  chiSquared: number;
  pValue: number;
  degreesOfFreedom: number;
  expectedDistribution: Record<string, number>;
  actualDistribution: Record<string, number>;
  sampleSize: number;
  recommendation: AuditRecommendation;
}

interface AuditReport {
  campaignId: string;
  generatedAt: string;
  mode: string;
  expressions: SerializedAuditResult[];
  overallRecommendation: AuditRecommendation;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BADGE_CLASSES: Record<AuditRecommendation, string> = {
  PASS: 'bg-success/15 text-success-ink',
  WARN: 'bg-warning/20 text-warning-ink',
  FAIL: 'bg-danger/15 text-danger-ink',
};

const BADGE_ICON: Record<AuditRecommendation, string> = {
  PASS: '✅',
  WARN: '⚠️',
  FAIL: '❌',
};

function RecommendationBadge({ rec }: { rec: AuditRecommendation }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${BADGE_CLASSES[rec]}`}>
      {BADGE_ICON[rec]} {rec}
    </span>
  );
}

function DistributionTable({ expression, result }: { expression: string; result: SerializedAuditResult }) {
  const totals = Object.keys(result.expectedDistribution)
    .map(Number)
    .sort((a, b) => a - b);

  if (totals.length === 0) return null;

  return (
    <div className="overflow-x-auto mt-2">
      <table className="text-xs w-full border-collapse">
        <thead>
          <tr className="text-ink-secondary">
            <th className="text-left pb-1 pr-3 font-medium">Total</th>
            <th className="text-right pb-1 pr-3 font-medium">Expected</th>
            <th className="text-right pb-1 font-medium">Actual</th>
          </tr>
        </thead>
        <tbody>
          {totals.map((t) => {
            const exp = result.expectedDistribution[t] ?? 0;
            const act = result.actualDistribution[t] ?? 0;
            const devPct = exp > 0 ? Math.abs((act - exp) / exp) : 0;
            const devClass =
              devPct > 0.3 ? 'text-danger-ink font-semibold' :
              devPct > 0.15 ? 'text-warning-ink' :
              'text-ink';

            return (
              <tr key={t} className="border-t border-ink-muted/10">
                <td className="py-0.5 pr-3 font-mono text-ink">{t}</td>
                <td className="py-0.5 pr-3 text-right text-ink-secondary">{exp.toFixed(1)}</td>
                <td className={`py-0.5 text-right ${devClass}`}>{act}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-ink-muted">
        χ² = {result.chiSquared.toFixed(3)}, p = {result.pValue.toFixed(4)}, n = {result.sampleSize}
      </p>
      <p className="text-xs text-ink-muted opacity-70">{expression}</p>
    </div>
  );
}

function ExpressionRow({ result }: { result: SerializedAuditResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-ink-muted/20 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-3 hover:bg-surface/50 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-ink">{result.expression}</span>
          <RecommendationBadge rec={result.recommendation} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted">n={result.sampleSize}</span>
          {expanded ? (
            <ChevronUp className="w-3 h-3 text-ink-muted" />
          ) : (
            <ChevronDown className="w-3 h-3 text-ink-muted" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-ink-muted/10">
          <DistributionTable expression={result.expression} result={result} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DiceAuditPanel
// ---------------------------------------------------------------------------

/**
 * DM-only panel showing chi-squared statistical analysis for each dice
 * expression rolled in the current campaign.
 */
export default function DiceAuditPanel() {
  const { socket } = useWebSocket();
  const { role } = useCampaign();

  const [report, setReport] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAudit = useCallback(() => {
    if (!socket || loading) return;
    setLoading(true);
    setError(null);

    socket.emit(
      'dice.audit',
      (ack: { ok: boolean; report?: AuditReport; error?: string }) => {
        setLoading(false);
        if (ack?.ok && ack.report) {
          setReport(ack.report);
        } else {
          setError(ack?.error ?? 'Audit failed');
        }
      },
    );
  }, [socket, loading]);

  if (role !== 'DM') return null;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-brand-ink" />
          <span className="text-sm font-semibold text-ink">Dice Distribution Audit</span>
        </div>
        <button
          onClick={runAudit}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-ink-secondary hover:text-ink disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Running…' : 'Run Audit'}
        </button>
      </div>

      {error && (
        <p className="text-xs text-danger-ink bg-danger/10 px-3 py-2 rounded" role="alert">
          {error}
        </p>
      )}

      {report && (
        <>
          {/* Overall result */}
          <div className="flex items-center gap-2 text-xs text-ink-secondary">
            <span>Overall:</span>
            <RecommendationBadge rec={report.overallRecommendation} />
            <span className="opacity-60">
              {new Date(report.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {/* Per-expression breakdown */}
          {report.expressions.length === 0 ? (
            <p className="text-xs text-ink-muted italic">No rolls yet — start rolling to generate data.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {report.expressions.map((r) => (
                <ExpressionRow key={r.expression} result={r} />
              ))}
            </div>
          )}

          {/* Legend */}
          <p className="text-xs text-ink-muted leading-relaxed">
            <strong>PASS</strong> p ≥ 0.05 · <strong>WARN</strong> p ≥ 0.01 · <strong>FAIL</strong> p &lt; 0.01.
            Fewer than 10 samples always passes.
          </p>
        </>
      )}

      {!report && !loading && (
        <p className="text-xs text-ink-muted italic">
          Click "Run Audit" to check whether rolls are statistically fair.
        </p>
      )}
    </div>
  );
}
