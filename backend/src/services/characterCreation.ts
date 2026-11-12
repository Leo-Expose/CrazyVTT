/**
 * Character Creation Proposal & Approval Service
 * PRD §8.2: "Player proposes -> DM approves/rejects/edits -> real-time sync"
 */

import logger from '../utils/logger';

export interface CharacterProposal {
  id: string;
  characterId: string;
  playerId: string;
  playerName: string;
  type: 'creation' | 'level_up' | 'rebuild';
  status: 'pending' | 'approved' | 'rejected' | 'modified';
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  dmNotes?: string;
  choices: {
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
  };
}

export class CharacterCreationService {
  private static proposals: Map<string, CharacterProposal> = new Map();

  static createProposal(params: Omit<CharacterProposal, 'id' | 'status' | 'createdAt'>): CharacterProposal {
    const proposal: CharacterProposal = {
      ...params,
      id: `prop-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    this.proposals.set(proposal.id, proposal);
    logger.info('Character creation proposal submitted', { proposalId: proposal.id, characterId: proposal.characterId });
    return proposal;
  }

  static getProposal(id: string): CharacterProposal | undefined {
    return this.proposals.get(id);
  }

  static listProposalsForCharacter(characterId: string): CharacterProposal[] {
    return Array.from(this.proposals.values()).filter((p) => p.characterId === characterId);
  }

  static listPendingProposals(): CharacterProposal[] {
    return Array.from(this.proposals.values()).filter((p) => p.status === 'pending');
  }

  static resolveProposal(
    proposalId: string,
    action: 'approved' | 'rejected' | 'modified',
    resolvedBy: string,
    dmNotes?: string,
    modifiedChoices?: CharacterProposal['choices'],
  ): CharacterProposal | null {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return null;

    proposal.status = action;
    proposal.resolvedAt = new Date().toISOString();
    proposal.resolvedBy = resolvedBy;
    proposal.dmNotes = dmNotes;

    if (action === 'modified' && modifiedChoices) {
      proposal.choices = { ...proposal.choices, ...modifiedChoices };
    }

    this.proposals.set(proposal.id, proposal);
    logger.info('Character proposal resolved', { proposalId, action, resolvedBy });
    return proposal;
  }
}
