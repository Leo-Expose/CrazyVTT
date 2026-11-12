import React, { useState } from 'react';
import { Shield, Sparkles, Check, X, Edit3, Clock, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { DND5E_RACES, DND5E_CLASSES } from '@/data/dnd5e';

export interface ProposalChoice {
  raceId?: string;
  raceName?: string;
  classId?: string;
  className?: string;
  subclassId?: string;
  subclassName?: string;
  background?: string;
  abilityScores?: Record<string, number>;
  equipment?: string[];
  spells?: string[];
  customNotes?: string;
}

export interface CharacterProposalItem {
  id: string;
  characterId: string;
  playerId: string;
  playerName: string;
  type: 'creation' | 'level_up' | 'rebuild';
  status: 'pending' | 'approved' | 'rejected' | 'modified';
  createdAt: string;
  choices: ProposalChoice;
  dmNotes?: string;
}

export interface CharacterCreationFlowProps {
  characterId: string;
  isDM: boolean;
  currentUserId: string;
  currentUserName: string;
  onApplyChoicesToSheet?: (choices: ProposalChoice) => void;
  onClose?: () => void;
}

export const CharacterCreationFlow: React.FC<CharacterCreationFlowProps> = ({
  characterId,
  isDM,
  currentUserId,
  currentUserName,
  onApplyChoicesToSheet,
  onClose,
}) => {
  // Persistent proposals store for character creation workflow (PRD §8.2)
  const storageKey = `cozyvtt:proposals:${characterId}`;
  const [proposals, setProposals] = useState<CharacterProposalItem[]>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          return JSON.parse(saved) as CharacterProposalItem[];
        } catch {}
      }
    }
    return [
      {
        id: 'prop-sample-1',
        characterId,
        playerId: currentUserId,
        playerName: currentUserName,
        type: 'creation',
        status: 'pending',
        createdAt: new Date().toISOString(),
        choices: {
          raceId: 'elf',
          raceName: 'Elf (High Elf)',
          classId: 'wizard',
          className: 'Wizard',
          background: 'Sage',
          customNotes: 'Interested in evocation spells and scholarly lore.',
        },
      },
    ];
  });

  // Save changes to localStorage
  const updateProposals = (newProposals: CharacterProposalItem[]) => {
    setProposals(newProposals);
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(storageKey, JSON.stringify(newProposals));
    }
  };

  // Player proposal form state
  const [selectedRace, setSelectedRace] = useState('human');
  const [selectedClass, setSelectedClass] = useState('fighter');
  const [background, setBackground] = useState('Soldier');
  const [customNotes, setCustomNotes] = useState('');
  const [editingProposalId, setEditingProposalId] = useState<string | null>(null);
  const [dmNoteInput, setDmNoteInput] = useState('');

  const handlePlayerSubmitProposal = () => {
    const raceObj = DND5E_RACES.find((r) => r.id === selectedRace);
    const classObj = DND5E_CLASSES.find((c) => c.id === selectedClass);

    const newProposal: CharacterProposalItem = {
      id: `prop-${Date.now()}`,
      characterId,
      playerId: currentUserId,
      playerName: currentUserName,
      type: 'creation',
      status: 'pending',
      createdAt: new Date().toISOString(),
      choices: {
        raceId: selectedRace,
        raceName: raceObj?.name ?? selectedRace,
        classId: selectedClass,
        className: classObj?.name ?? selectedClass,
        background,
        customNotes,
      },
    };

    updateProposals([newProposal, ...proposals]);
    setCustomNotes('');
  };

  const handleDMResolve = (
    proposalId: string,
    action: 'approved' | 'rejected' | 'modified',
  ) => {
    const updated = proposals.map((p) => {
      if (p.id === proposalId) {
        const next = {
          ...p,
          status: action,
          dmNotes: dmNoteInput || p.dmNotes,
        };
        if (action === 'approved') {
          onApplyChoicesToSheet?.(p.choices);
        }
        return next;
      }
      return p;
    });
    updateProposals(updated);
    setEditingProposalId(null);
    setDmNoteInput('');
  };

  return (
    <div className="bg-surface text-ink p-6 rounded-2xl border border-edge shadow-xl max-w-2xl w-full mx-auto space-y-6">
      <div className="flex items-center justify-between border-b border-edge pb-4">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-brand" />
          <div>
            <h2 className="text-lg font-bold">Collaborative Character Creation</h2>
            <p className="text-xs text-ink-muted">PRD §8.2: Player proposes &rarr; DM reviews &amp; approves &rarr; Auto-applies to sheet</p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-ink-muted hover:text-ink rounded-lg hover:bg-surface-light"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* DM View: Pending Proposals for Review */}
      {isDM ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-brand">
            <Shield className="w-4 h-4" />
            DM Review Panel ({proposals.filter((p) => p.status === 'pending').length} Pending)
          </div>

          <div className="space-y-3">
            {proposals.map((prop) => (
              <div
                key={prop.id}
                className="p-4 rounded-xl border border-edge bg-surface-light space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{prop.playerName}&rsquo;s Proposal</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full capitalize bg-brand/10 text-brand">
                      {prop.type.replace('_', ' ')}
                    </span>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded capitalize font-medium ${
                      prop.status === 'pending'
                        ? 'bg-warning/20 text-warning-ink'
                        : prop.status === 'approved'
                        ? 'bg-success/20 text-success-ink'
                        : 'bg-danger/20 text-danger-ink'
                    }`}
                  >
                    {prop.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-ink-muted bg-surface/50 p-2.5 rounded-lg border border-edge/60">
                  <div><strong>Race:</strong> {prop.choices.raceName || prop.choices.raceId || 'None'}</div>
                  <div><strong>Class:</strong> {prop.choices.className || prop.choices.classId || 'None'}</div>
                  <div><strong>Background:</strong> {prop.choices.background || 'None'}</div>
                  <div><strong>Submitted:</strong> {new Date(prop.createdAt).toLocaleTimeString()}</div>
                  {prop.choices.customNotes && (
                    <div className="col-span-2 pt-1 border-t border-edge/40">
                      <strong>Notes:</strong> {prop.choices.customNotes}
                    </div>
                  )}
                </div>

                {prop.status === 'pending' && (
                  <div className="space-y-2 pt-2 border-t border-edge">
                    {editingProposalId === prop.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          placeholder="DM note / adjustment instructions..."
                          value={dmNoteInput}
                          onChange={(e) => setDmNoteInput(e.target.value)}
                          className="w-full bg-surface border border-edge rounded px-2.5 py-1.5 text-xs"
                        />
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="secondary"
                            onClick={() => setEditingProposalId(null)}
                            className="text-xs py-1 px-3"
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={() => handleDMResolve(prop.id, 'modified')}
                            className="text-xs py-1 px-3"
                          >
                            Save with Edits
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => setEditingProposalId(prop.id)}
                          className="text-xs py-1 px-2.5"
                        >
                          <Edit3 className="w-3.5 h-3.5 mr-1" />
                          Edit
                        </Button>
                        <button
                          type="button"
                          onClick={() => handleDMResolve(prop.id, 'rejected')}
                          className="px-2.5 py-1 text-xs text-danger hover:bg-danger/10 rounded font-medium transition-colors"
                        >
                          Reject
                        </button>
                        <Button
                          onClick={() => handleDMResolve(prop.id, 'approved')}
                          className="text-xs py-1 px-3"
                        >
                          <Check className="w-3.5 h-3.5 mr-1" />
                          Approve &amp; Apply
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Player View: Propose Choices */
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-brand">
            <Clock className="w-4 h-4" />
            Propose Character Choices to DM
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Proposed Race/Species</label>
                <select
                  value={selectedRace}
                  onChange={(e) => setSelectedRace(e.target.value)}
                  className="w-full bg-surface-light border border-edge rounded-lg px-2.5 py-1.5 text-xs"
                >
                  {DND5E_RACES.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Proposed Class</label>
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="w-full bg-surface-light border border-edge rounded-lg px-2.5 py-1.5 text-xs"
                >
                  {DND5E_CLASSES.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Background</label>
              <input
                type="text"
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                placeholder="e.g. Soldier, Sage, Acolyte, Outlander"
                className="w-full bg-surface-light border border-edge rounded-lg px-2.5 py-1.5 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Notes for DM</label>
              <textarea
                rows={2}
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                placeholder="Mention desired feats, special backstory hooks, or equipment requests..."
                className="w-full bg-surface-light border border-edge rounded-lg px-2.5 py-1.5 text-xs"
              />
            </div>

            <Button onClick={handlePlayerSubmitProposal} className="w-full text-xs py-2">
              <Sparkles className="w-4 h-4 mr-1.5" />
              Submit Proposal for DM Review
            </Button>
          </div>

          {/* Player's proposal history */}
          <div className="pt-4 border-t border-edge">
            <h4 className="text-xs font-semibold text-ink-muted mb-2">My Recent Proposals</h4>
            <div className="space-y-2">
              {proposals.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-surface-light border border-edge text-xs">
                  <div>
                    <span className="font-semibold">{p.choices.raceName} &middot; {p.choices.className}</span>
                    <span className="text-ink-muted block text-[11px]">{p.choices.background}</span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded capitalize font-medium ${
                      p.status === 'pending'
                        ? 'bg-warning/20 text-warning-ink'
                        : p.status === 'approved'
                        ? 'bg-success/20 text-success-ink'
                        : 'bg-danger/20 text-danger-ink'
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
