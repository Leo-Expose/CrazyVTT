import React, { useState } from 'react';
import { BookOpen, Check, Copy, Wand2, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { parseMonsterStatBlock, type ParsedStatBlock } from '@/utils/statBlockParser';

export interface HomebrewParserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportParsed: (creature: ParsedStatBlock) => void;
}

const SAMPLE_STAT_BLOCK = `Goblin Boss
Small humanoid (goblinoid), neutral evil
Armor Class 17 (chain shirt, shield)
Hit Points 21 (6d6)
Speed 30 ft.
STR 10 (+0) DEX 14 (+2) CON 10 (+0) INT 10 (+0) WIS 8 (-1) CHA 10 (+0)
Skills Stealth +6
Senses darkvision 60 ft., passive Perception 9
Languages Common, Goblin
Challenge 1 (200 XP)
Scimitar. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.
Javelin. Melee or Ranged Weapon Attack: +4 to hit, reach 5 ft. or range 30/120 ft., one target. Hit: 5 (1d6 + 2) piercing damage.`;

export const HomebrewParserModal: React.FC<HomebrewParserModalProps> = ({
  isOpen,
  onClose,
  onImportParsed,
}) => {
  if (!isOpen) return null;

  const [rawText, setRawText] = useState(SAMPLE_STAT_BLOCK);
  const [parsed, setParsed] = useState<ParsedStatBlock | null>(null);

  const handleParse = () => {
    const result = parseMonsterStatBlock(rawText);
    setParsed(result);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
      <div className="bg-surface text-ink border border-edge rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4 animate-scale-in">
        <div className="flex items-center justify-between border-b border-edge pb-3">
          <div className="flex items-center gap-2.5">
            <Wand2 className="w-6 h-6 text-brand" />
            <div>
              <h3 className="font-bold text-base">Rulebook &amp; Homebrew Parser (PRD §17.3)</h3>
              <p className="text-xs text-ink-muted">Paste text/markdown stat blocks to auto-convert into ready-to-drop VTT creatures.</p>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-ink-muted">Raw Stat Block Text</label>
            <textarea
              rows={12}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="w-full p-2.5 bg-surface-light border border-edge rounded-xl text-xs font-mono select-text"
              placeholder="Paste monster or NPC stat block here..."
            />
            <Button onClick={handleParse} className="w-full text-xs py-2">
              <Wand2 className="w-3.5 h-3.5 mr-1" />
              Parse Stat Block
            </Button>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-ink-muted">Parsed VTT Token Template</label>
            {parsed ? (
              <div className="p-3 bg-surface-light border border-edge rounded-xl text-xs space-y-2 max-h-80 overflow-y-auto">
                <div className="font-bold text-sm text-brand">{parsed.name}</div>
                <div className="text-[11px] text-ink-muted italic">{parsed.size} {parsed.type}, {parsed.alignment}</div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-edge">
                  <div><strong>AC:</strong> {parsed.armorClass}</div>
                  <div><strong>HP:</strong> {parsed.hitPoints} ({parsed.hitDice})</div>
                  <div><strong>Speed:</strong> {parsed.speed}</div>
                  <div><strong>CR:</strong> {parsed.challengeRating}</div>
                </div>
                <div className="pt-1 border-t border-edge">
                  <strong>Actions ({parsed.actions.length}):</strong>
                  <div className="space-y-1 mt-1">
                    {parsed.actions.map((act, i) => (
                      <div key={i} className="p-1.5 bg-surface rounded border border-edge/60 text-[11px]">
                        <span className="font-semibold text-brand">{act.name}</span>: {act.description}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 border border-dashed border-edge rounded-xl text-xs text-ink-muted text-center flex flex-col items-center justify-center h-52">
                <BookOpen className="w-8 h-8 opacity-40 mb-2" />
                Click &ldquo;Parse Stat Block&rdquo; to preview structured VTT actions, AC, and HP.
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-edge">
          <Button variant="secondary" onClick={onClose} className="text-xs py-1.5 px-3">
            Cancel
          </Button>
          <Button
            disabled={!parsed}
            onClick={() => {
              if (parsed) {
                onImportParsed(parsed);
                onClose();
              }
            }}
            className="text-xs py-1.5 px-3.5"
          >
            <Check className="w-4 h-4 mr-1.5" />
            Import to Creature Library
          </Button>
        </div>
      </div>
    </div>
  );
};
