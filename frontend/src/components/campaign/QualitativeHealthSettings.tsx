import React, { useState } from 'react';
import { Shield, Info } from 'lucide-react';
import type { HealthThresholds, HealthDisplayMode } from '@/utils/rules/qualitativeHealth';
import {
  DEFAULT_THRESHOLDS,
  QualitativeHealth,
  HEALTH_BORDER_COLORS,
  HEALTH_BADGE_EMOJI,
  getHealthDisplayName,
} from '@/utils/rules/qualitativeHealth';

export interface QualitativeHealthSettingsProps {
  healthDisplayMode: HealthDisplayMode;
  onHealthDisplayModeChange: (mode: HealthDisplayMode) => void;
  thresholds: HealthThresholds;
  onThresholdsChange: (thresholds: HealthThresholds) => void;
  disabled?: boolean;
}

export const QualitativeHealthSettings: React.FC<QualitativeHealthSettingsProps> = ({
  healthDisplayMode,
  onHealthDisplayModeChange,
  thresholds,
  onThresholdsChange,
  disabled = false,
}) => {
  const [localHealthy, setLocalHealthy] = useState(Math.round(thresholds.healthy * 100));
  const [localWounded, setLocalWounded] = useState(Math.round(thresholds.wounded * 100));
  const [localBloodied, setLocalBloodied] = useState(Math.round(thresholds.bloodied * 100));
  const [localCritical, setLocalCritical] = useState(Math.round(thresholds.critical * 100));

  const handleApplyThresholds = () => {
    onThresholdsChange({
      healthy: Math.max(0.01, Math.min(1.0, localHealthy / 100)),
      wounded: Math.max(0.01, Math.min(1.0, localWounded / 100)),
      bloodied: Math.max(0.01, Math.min(1.0, localBloodied / 100)),
      critical: Math.max(0.01, Math.min(1.0, localCritical / 100)),
    });
  };

  const handleResetDefaults = () => {
    setLocalHealthy(Math.round(DEFAULT_THRESHOLDS.healthy * 100));
    setLocalWounded(Math.round(DEFAULT_THRESHOLDS.wounded * 100));
    setLocalBloodied(Math.round(DEFAULT_THRESHOLDS.bloodied * 100));
    setLocalCritical(Math.round(DEFAULT_THRESHOLDS.critical * 100));
    onThresholdsChange(DEFAULT_THRESHOLDS);
  };

  return (
    <div className="space-y-6 text-ink">
      <div>
        <h3 className="text-base font-semibold flex items-center gap-2 mb-1">
          <Shield className="w-5 h-5 text-brand" />
          Enemy Health Representation
        </h3>
        <p className="text-xs text-ink-muted">
          Choose what players see when viewing enemy and NPC health bars and tooltips. DMs always see exact numbers.
        </p>
      </div>

      {/* Mode selection */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onHealthDisplayModeChange('none')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            healthDisplayMode === 'none'
              ? 'border-brand bg-brand/10 ring-1 ring-brand'
              : 'border-edge bg-surface-light hover:border-edge-strong'
          }`}
        >
          <div className="font-semibold text-sm mb-1">None</div>
          <div className="text-xs text-ink-muted leading-relaxed">
            No health bar, qualitative ring, or HP status shown to players.
          </div>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onHealthDisplayModeChange('qualitative')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            healthDisplayMode === 'qualitative'
              ? 'border-brand bg-brand/10 ring-1 ring-brand'
              : 'border-edge bg-surface-light hover:border-edge-strong'
          }`}
        >
          <div className="font-semibold text-sm mb-1 flex items-center gap-1.5">
            Qualitative <span className="text-[10px] px-1.5 py-0.2 bg-brand/20 text-brand rounded font-normal">PRD §14</span>
          </div>
          <div className="text-xs text-ink-muted leading-relaxed">
            Players see descriptive health tiers (&ldquo;Healthy&rdquo;, &ldquo;Wounded&rdquo;, &ldquo;Bloodied&rdquo;) with colored rings. Zero exact HP sent.
          </div>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onHealthDisplayModeChange('exact')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            healthDisplayMode === 'exact'
              ? 'border-brand bg-brand/10 ring-1 ring-brand'
              : 'border-edge bg-surface-light hover:border-edge-strong'
          }`}
        >
          <div className="font-semibold text-sm mb-1">Exact HP</div>
          <div className="text-xs text-ink-muted leading-relaxed">
            Players see full exact HP values and numbers when health bars are enabled.
          </div>
        </button>
      </div>

      {/* Qualitative Thresholds Configuration */}
      {healthDisplayMode === 'qualitative' && (
        <div className="space-y-4 pt-2 border-t border-edge">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold">Health Tiers &amp; Thresholds</h4>
              <p className="text-xs text-ink-muted">
                Percentages represent the lower bound for each qualitative state tier.
              </p>
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={handleResetDefaults}
              className="text-xs text-brand hover:underline font-medium"
            >
              Reset to Defaults
            </button>
          </div>

          <div className="space-y-3">
            {/* Healthy */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-light border border-edge">
              <div className="flex items-center gap-2">
                <span className="text-base">{HEALTH_BADGE_EMOJI[QualitativeHealth.HEALTHY]}</span>
                <span
                  className="w-3 h-3 rounded-full border"
                  style={{ backgroundColor: HEALTH_BORDER_COLORS[QualitativeHealth.HEALTHY] }}
                />
                <span className="text-xs font-medium">{getHealthDisplayName(QualitativeHealth.HEALTHY)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-muted">&gt;</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  disabled={disabled}
                  value={localHealthy}
                  onChange={(e) => setLocalHealthy(parseInt(e.target.value, 10) || 0)}
                  onBlur={handleApplyThresholds}
                  className="w-14 px-2 py-1 text-xs text-right bg-surface border border-edge rounded font-mono"
                />
                <span className="text-xs text-ink-muted">%</span>
              </div>
            </div>

            {/* Wounded */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-light border border-edge">
              <div className="flex items-center gap-2">
                <span className="text-base">{HEALTH_BADGE_EMOJI[QualitativeHealth.WOUNDED]}</span>
                <span
                  className="w-3 h-3 rounded-full border"
                  style={{ backgroundColor: HEALTH_BORDER_COLORS[QualitativeHealth.WOUNDED] }}
                />
                <span className="text-xs font-medium">{getHealthDisplayName(QualitativeHealth.WOUNDED)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-muted">&gt;</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  disabled={disabled}
                  value={localWounded}
                  onChange={(e) => setLocalWounded(parseInt(e.target.value, 10) || 0)}
                  onBlur={handleApplyThresholds}
                  className="w-14 px-2 py-1 text-xs text-right bg-surface border border-edge rounded font-mono"
                />
                <span className="text-xs text-ink-muted">%</span>
              </div>
            </div>

            {/* Bloodied */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-light border border-edge">
              <div className="flex items-center gap-2">
                <span className="text-base">{HEALTH_BADGE_EMOJI[QualitativeHealth.BLOODIED]}</span>
                <span
                  className="w-3 h-3 rounded-full border"
                  style={{ backgroundColor: HEALTH_BORDER_COLORS[QualitativeHealth.BLOODIED] }}
                />
                <span className="text-xs font-medium">{getHealthDisplayName(QualitativeHealth.BLOODIED)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-muted">&gt;</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  disabled={disabled}
                  value={localBloodied}
                  onChange={(e) => setLocalBloodied(parseInt(e.target.value, 10) || 0)}
                  onBlur={handleApplyThresholds}
                  className="w-14 px-2 py-1 text-xs text-right bg-surface border border-edge rounded font-mono"
                />
                <span className="text-xs text-ink-muted">%</span>
              </div>
            </div>

            {/* Critical */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-light border border-edge">
              <div className="flex items-center gap-2">
                <span className="text-base">{HEALTH_BADGE_EMOJI[QualitativeHealth.CRITICAL]}</span>
                <span
                  className="w-3 h-3 rounded-full border"
                  style={{ backgroundColor: HEALTH_BORDER_COLORS[QualitativeHealth.CRITICAL] }}
                />
                <span className="text-xs font-medium">{getHealthDisplayName(QualitativeHealth.CRITICAL)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-muted">&gt;</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  disabled={disabled}
                  value={localCritical}
                  onChange={(e) => setLocalCritical(parseInt(e.target.value, 10) || 0)}
                  onBlur={handleApplyThresholds}
                  className="w-14 px-2 py-1 text-xs text-right bg-surface border border-edge rounded font-mono"
                />
                <span className="text-xs text-ink-muted">%</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 bg-brand/5 border border-brand/20 rounded-lg text-xs text-ink-muted">
            <Info className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            <div>
              <strong>Server-enforced payload safety:</strong> When Qualitative or None is selected, exact enemy HP values (<code className="font-mono">hp.current</code>, <code className="font-mono">hp.max</code>) are stripped from network payloads sent to player browsers, preventing network tab leakage.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
