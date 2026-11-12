/**
 * D&D 5e / Homebrew Stat Block Parser
 * Converts plain text, markdown, or monster stat blocks into VTT-compatible token templates and active actions.
 */

export interface ParsedStatBlock {
  name: string;
  size?: 'Tiny' | 'Small' | 'Medium' | 'Large' | 'Huge' | 'Gargantuan';
  type?: string;
  alignment?: string;
  armorClass: number;
  armorType?: string;
  hitPoints: number;
  hitDice?: string;
  speed: string;
  stats: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  savingThrows?: Record<string, number>;
  skills?: Record<string, number>;
  damageVulnerabilities?: string[];
  damageResistances?: string[];
  damageImmunities?: string[];
  conditionImmunities?: string[];
  senses?: string;
  languages?: string;
  challengeRating: string;
  actions: Array<{
    name: string;
    description: string;
    attackBonus?: number;
    damageExpression?: string;
    damageType?: string;
  }>;
}

function calculateMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function parseMonsterStatBlock(text: string): ParsedStatBlock {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  let name = 'Unknown Creature';
  let size: ParsedStatBlock['size'] = 'Medium';
  let type = 'humanoid';
  let alignment = 'unaligned';
  let armorClass = 10;
  let hitPoints = 10;
  let hitDice = '2d8+2';
  let speed = '30 ft.';
  let challengeRating = '1/4';

  const stats = {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  };

  const actions: ParsedStatBlock['actions'] = [];

  if (lines.length > 0) {
    name = lines[0].replace(/^[#*]+/, '').trim();
  }

  // Scan lines with regex
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Size, Type, Alignment line (e.g. "Medium humanoid (goblinoid), neutral evil")
    const metaMatch = line.match(/(Tiny|Small|Medium|Large|Huge|Gargantuan)\s+([\w\s()]+),\s*(.+)/i);
    if (metaMatch) {
      size = metaMatch[1] as ParsedStatBlock['size'];
      type = metaMatch[2];
      alignment = metaMatch[3];
    }

    // Armor Class
    const acMatch = line.match(/(?:Armor Class|AC)\s*[:]?\s*(\d+)/i);
    if (acMatch) {
      armorClass = parseInt(acMatch[1], 10);
    }

    // Hit Points
    const hpMatch = line.match(/(?:Hit Points|HP)\s*[:]?\s*(\d+)(?:\s*\(([^)]+)\))?/i);
    if (hpMatch) {
      hitPoints = parseInt(hpMatch[1], 10);
      if (hpMatch[2]) hitDice = hpMatch[2];
    }

    // Speed
    const speedMatch = line.match(/Speed\s*[:]?\s*(.+)/i);
    if (speedMatch) {
      speed = speedMatch[1];
    }

    // Challenge Rating
    const crMatch = line.match(/Challenge\s*[:]?\s*([0-9/]+)/i);
    if (crMatch) {
      challengeRating = crMatch[1];
    }

    // Ability scores: STR DEX CON INT WIS CHA or table format
    const strMatch = line.match(/STR\s*[:]?\s*(\d+)/i);
    if (strMatch) stats.strength = parseInt(strMatch[1], 10);
    const dexMatch = line.match(/DEX\s*[:]?\s*(\d+)/i);
    if (dexMatch) stats.dexterity = parseInt(dexMatch[1], 10);
    const conMatch = line.match(/CON\s*[:]?\s*(\d+)/i);
    if (conMatch) stats.constitution = parseInt(conMatch[1], 10);
    const intMatch = line.match(/INT\s*[:]?\s*(\d+)/i);
    if (intMatch) stats.intelligence = parseInt(intMatch[1], 10);
    const wisMatch = line.match(/WIS\s*[:]?\s*(\d+)/i);
    if (wisMatch) stats.wisdom = parseInt(wisMatch[1], 10);
    const chaMatch = line.match(/CHA\s*[:]?\s*(\d+)/i);
    if (chaMatch) stats.charisma = parseInt(chaMatch[1], 10);

    // Common inline 6-ability row (e.g. "10 (+0) 14 (+2) 12 (+1) 8 (-1) 12 (+1) 6 (-2)")
    const sixAbilities = line.match(/(\d+)\s*\([+-]?\d+\)\s+(\d+)\s*\([+-]?\d+\)\s+(\d+)\s*\([+-]?\d+\)\s+(\d+)\s*\([+-]?\d+\)\s+(\d+)\s*\([+-]?\d+\)\s+(\d+)\s*\([+-]?\d+\)/);
    if (sixAbilities) {
      stats.strength = parseInt(sixAbilities[1], 10);
      stats.dexterity = parseInt(sixAbilities[2], 10);
      stats.constitution = parseInt(sixAbilities[3], 10);
      stats.intelligence = parseInt(sixAbilities[4], 10);
      stats.wisdom = parseInt(sixAbilities[5], 10);
      stats.charisma = parseInt(sixAbilities[6], 10);
    }

    // Parse Actions (e.g., "Scimitar. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.")
    const actionMatch = line.match(/^([A-Za-z0-9\s()'-]+)[.:]\s*(.+)/);
    if (actionMatch && (line.includes('Attack:') || line.includes('Hit:') || line.includes('saving throw'))) {
      const actName = actionMatch[1].trim();
      const actDesc = actionMatch[2].trim();

      let attackBonus: number | undefined;
      const atkMatch = actDesc.match(/([+-]\d+)\s*to\s*hit/i);
      if (atkMatch) attackBonus = parseInt(atkMatch[1], 10);

      let damageExpression: string | undefined;
      let damageType: string | undefined;
      const dmgMatch = actDesc.match(/Hit:\s*\d+\s*(?:\(([^)]+)\))?\s*(\w+)?\s*damage/i);
      if (dmgMatch) {
        damageExpression = dmgMatch[1] ? dmgMatch[1].replace(/\s+/g, '') : undefined;
        damageType = dmgMatch[2] ? dmgMatch[2].toLowerCase() : undefined;
      }

      actions.push({
        name: actName,
        description: actDesc,
        attackBonus,
        damageExpression,
        damageType,
      });
    }
  }

  return {
    name,
    size,
    type,
    alignment,
    armorClass,
    hitPoints,
    hitDice,
    speed,
    stats,
    challengeRating,
    actions,
  };
}
