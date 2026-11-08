/**
 * LLM Extractor for Rulebook Content
 * 
 * This module provides structured prompts for extracting different content types
 * from rulebook text. For now, these are stubs with TODO comments - we'll
 * integrate Anthropic/OpenAI later.
 */

import { ChunkType } from '../../validators/rulebooks';

/**
 * Structured prompts for each chunk type
 * These will be sent to an LLM to extract structured data from raw text
 */
export const LLM_EXTRACTION_PROMPTS: Record<ChunkType, string> = {
  SPELL: `
Extract spell information from the provided D&D 5e rulebook text. Return a JSON object with the following structure:
{
  "name": "string",
  "level": "number (0-9)",
  "school": "string (Abjuration, Conjuration, Divination, Enchantment, Evocation, Illusion, Necromancy, Transmutation)",
  "castingTime": "string",
  "range": "string",
  "components": { "verbal": boolean, "somatic": boolean, "material": boolean, "materialDescription": "string?" },
  "duration": "string",
  "description": "string",
  "atHigherLevels": "string?",
  "source": "string",
  "page": "number"
}

Only extract spells that are fully defined in the text. If the text doesn't contain a complete spell, return null.
`,

  ITEM: `
Extract magic item information from the provided D&D 5e rulebook text. Return a JSON object with the following structure:
{
  "name": "string",
  "type": "string (Weapon, Armor, Wondrous Item, Potion, Ring, Rod, Scroll, Staff, Wand, etc.)",
  "rarity": "string (Common, Uncommon, Rare, Very Rare, Legendary, Artifact)",
  "requiresAttunement": boolean,
  "attunementRequirement": "string?",
  "description": "string",
  "properties": "string[]?",
  "source": "string",
  "page": "number"
}

Only extract items that are fully defined in the text. If the text doesn't contain a complete item, return null.
`,

  CLASS: `
Extract class information from the provided D&D 5e rulebook text. Return a JSON object with the following structure:
{
  "name": "string",
  "hitDie": "number",
  "primaryAbility": "string[]",
  "savingThrows": "string[]",
  "proficiencies": { "armor": "string[]", "weapons": "string[]", "tools": "string[]", "skills": "string[]" },
  "features": [
    { "level": number, "name": "string", "description": "string" }
  ],
  "subclasses": [
    { "name": "string", "description": "string", "features": [{ "level": number, "name": "string", "description": "string" }] }
  ],
  "spellcasting": { "ability": "string", "preparation": "string", "spellList": "string?" }?,
  "source": "string",
  "page": "number"
}

Only extract classes that are fully defined in the text. If the text doesn't contain a complete class, return null.
`,

  SUBCLASS: `
Extract subclass information from the provided D&D 5e rulebook text. Return a JSON object with the following structure:
{
  "name": "string",
  "className": "string",
  "description": "string",
  "features": [
    { "level": number, "name": "string", "description": "string" }
  ],
  "spellcasting": { "ability": "string", "preparation": "string", "spellList": "string?" }?,
  "source": "string",
  "page": "number"
}

Only extract subclasses that are fully defined in the text. If the text doesn't contain a complete subclass, return null.
`,

  FEAT: `
Extract feat information from the provided D&D 5e rulebook text. Return a JSON object with the following structure:
{
  "name": "string",
  "prerequisite": "string?",
  "description": "string",
  "benefit": "string",
  "source": "string",
  "page": "number"
}

Only extract feats that are fully defined in the text. If the text doesn't contain a complete feat, return null.
`,

  MONSTER: `
Extract monster/NPC information from the provided D&D 5e rulebook text. Return a JSON object with the following structure:
{
  "name": "string",
  "size": "string (Tiny, Small, Medium, Large, Huge, Gargantuan)",
  "type": "string",
  "alignment": "string",
  "armorClass": number,
  "hitPoints": { "average": number, "formula": "string" },
  "speed": { "walk": number, "fly": number?, "swim": number?, "climb": number? },
  "abilities": { "str": number, "dex": number, "con": number, "int": number, "wis": number, "cha": number },
  "savingThrows": "Record<string, number>?",
  "skills": "Record<string, number>?",
  "damageResistances": "string?",
  "damageImmunities": "string?",
  "conditionImmunities": "string?",
  "senses": "string",
  "languages": "string",
  "challenge": "string",
  "proficiencyBonus": number,
  "traits": [{ "name": "string", "description": "string" }],
  "actions": [{ "name": "string", "description": "string" }],
  "reactions": [{ "name": "string", "description": "string" }],
  "legendaryActions": [{ "name": "string", "description": "string" }],
  "source": "string",
  "page": "number"
}

Only extract monsters that are fully defined in the text. If the text doesn't contain a complete monster, return null.
`,

  RACE: `
Extract race information from the provided D&D 5e rulebook text. Return a JSON object with the following structure:
{
  "name": "string",
  "description": "string",
  "speed": number,
  "size": "string (Small, Medium)",
  "abilityScoreIncreases": "Record<string, number>",
  "traits": [{ "name": "string", "description": "string" }],
  "subraces": [
    { "name": "string", "description": "string", "abilityScoreIncreases": "Record<string, number>", "traits": [{ "name": "string", "description": "string" }] }
  ],
  "source": "string",
  "page": "number"
}

Only extract races that are fully defined in the text. If the text doesn't contain a complete race, return null.
`,

  BACKGROUND: `
Extract background information from the provided D&D 5e rulebook text. Return a JSON object with the following structure:
{
  "name": "string",
  "description": "string",
  "skillProficiencies": "string[]",
  "toolProficiencies": "string[]",
  "languages": "number",
  "equipment": "string[]",
  "feature": { "name": "string", "description": "string" },
  "suggestedCharacteristics": {
    "personalityTraits": "string[]",
    "ideals": "string[]",
    "bonds": "string[]",
    "flaws": "string[]"
  },
  "source": "string",
  "page": "number"
}

Only extract backgrounds that are fully defined in the text. If the text doesn't contain a complete background, return null.
`,

  RULE: `
Extract rule/mechanic information from the provided D&D 5e rulebook text. Return a JSON object with the following structure:
{
  "name": "string",
  "category": "string (Combat, Exploration, Social, Magic, Character Creation, etc.)",
  "description": "string",
  "details": "string",
  "source": "string",
  "page": "number"
}

Only extract rules that are clearly defined in the text. If the text doesn't contain a complete rule, return null.
`,

  TABLE: `
Extract table data from the provided D&D 5e rulebook text. Return a JSON object with the following structure:
{
  "name": "string",
  "caption": "string",
  "headers": "string[]",
  "rows": "string[][]",
  "source": "string",
  "page": "number"
}

Only extract tables that are complete in the text. If the text doesn't contain a complete table, return null.
`,

  NARRATIVE: `
Extract narrative/lore text from the provided D&D 5e rulebook text. Return a JSON object with the following structure:
{
  "title": "string",
  "content": "string",
  "category": "string (Lore, Flavor Text, History, Geography, Organization, Deity, etc.)",
  "source": "string",
  "page": "number"
}

Extract significant narrative passages. Return null for purely mechanical text.
`,
};

/**
 * System prompt for the LLM extractor
 */
export const LLM_SYSTEM_PROMPT = `
You are an expert D&D 5e content extractor. Your job is to parse rulebook text and extract structured data for various content types (spells, items, classes, monsters, etc.).

Rules:
1. Only extract content that is COMPLETE and WELL-DEFINED in the provided text.
2. If the text is incomplete, cut off, or ambiguous, return null.
3. Follow the exact JSON structure specified in the prompt.
4. Use the exact field names and types specified.
5. For optional fields, omit them entirely if not present in the text.
6. Page numbers should be integers.
7. All string values should be trimmed of excess whitespace.
8. Confidence score: Include a "confidence" field (0.0-1.0) indicating how confident you are in the extraction.
`;

/**
 * Call LLM to extract structured content (STUB - TODO: integrate with Anthropic/OpenAI)
 * @param chunkType Type of content to extract
 * @param rawText Raw text from rulebook pages
 * @param pageStart Starting page number
 * @param pageEnd Ending page number
 * @returns Extracted structured data with confidence score
 */
export async function extractWithLLM(
  chunkType: ChunkType,
  rawText: string,
  pageStart: number,
  pageEnd: number
): Promise<{ structured: unknown; confidence: number } | null> {
  // TODO: Integrate with Anthropic/OpenAI API
  // For now, return a stub response

  console.log(`[LLM Extractor] Would extract ${chunkType} from pages ${pageStart}-${pageEnd}`);
  console.log(`[LLM Extractor] Text length: ${rawText.length} chars`);

  // TODO: Implement actual LLM call
  // const response = await anthropic.messages.create({
  //   model: 'claude-3-opus-20240229',
  //   max_tokens: 4000,
  //   system: LLM_SYSTEM_PROMPT,
  //   messages: [
  //     { role: 'user', content: LLM_EXTRACTION_PROMPTS[chunkType] + '\n\nText:\n' + rawText }
  //   ]
  // });
  // return parseLLMResponse(response);

  // Stub implementation - returns null to indicate extraction not yet implemented
  return null;
}

/**
 * Detect content type from raw text (heuristic)
 * @param rawText Text to analyze
 * @returns Detected chunk type or null
 */
export function detectContentType(rawText: string): ChunkType | null {
  const lowerText = rawText.toLowerCase();

  // Spell indicators
  if (lowerText.includes('casting time') && lowerText.includes('spell level') &&
      (lowerText.includes('school') || lowerText.includes('evocation') || lowerText.includes('abjuration'))) {
    return 'SPELL';
  }

  // Item indicators
  if (lowerText.includes('wondrous item') || lowerText.includes('magic item') ||
      (lowerText.includes('rarity') && (lowerText.includes('attunement') || lowerText.includes('weapon') || lowerText.includes('armor')))) {
    return 'ITEM';
  }

  // Class indicators
  if (lowerText.includes('hit die') && lowerText.includes('class features') &&
      lowerText.includes('proficiencies')) {
    return 'CLASS';
  }

  // Monster indicators
  if (lowerText.includes('armor class') && lowerText.includes('hit points') &&
      lowerText.includes('challenge') && lowerText.includes('speed')) {
    return 'MONSTER';
  }

  // Race indicators
  if (lowerText.includes('ability score increase') && lowerText.includes('speed') &&
      (lowerText.includes('size') || lowerText.includes('traits'))) {
    return 'RACE';
  }

  // Background indicators
  if (lowerText.includes('background') && lowerText.includes('skill proficiencies') &&
      lowerText.includes('feature:')) {
    return 'BACKGROUND';
  }

  // Feat indicators
  if (lowerText.includes('prerequisite') && lowerText.includes('benefit') &&
      !lowerText.includes('class feature')) {
    return 'FEAT';
  }

  // Table indicators
  if (lowerText.includes('|') && lowerText.split('\n').some(line => line.includes('|') && line.split('|').length > 2)) {
    return 'TABLE';
  }

  return null;
}

/**
 * Split text into chunks by content type
 * @param pages Array of extracted pages
 * @returns Array of chunks with detected content types
 */
export function chunkByContentType(pages: { pageNumber: number; text: string }[]): {
  chunkType: ChunkType;
  pageStart: number;
  pageEnd: number;
  text: string;
}[] {
  const chunks: {
    chunkType: ChunkType;
    pageStart: number;
    pageEnd: number;
    text: string;
  }[] = [];

  let currentChunk: { chunkType: ChunkType | null; pageStart: number; text: string } | null = null;

  for (const page of pages) {
    const detectedType = detectContentType(page.text);

    const currentType: ChunkType | null = currentChunk ? currentChunk.chunkType : null;
    if (detectedType && detectedType !== currentType) {
      // Save previous chunk
      if (currentChunk) {
        chunks.push({
          chunkType: currentChunk.chunkType!,
          pageStart: currentChunk.pageStart,
          pageEnd: page.pageNumber - 1,
          text: currentChunk.text,
        });
      }
      // Start new chunk
      currentChunk = {
        chunkType: detectedType,
        pageStart: page.pageNumber,
        text: page.text,
      };
    } else if (currentChunk) {
      // Continue current chunk
      currentChunk.text += '\n\n' + page.text;
    } else if (detectedType) {
      // Start first chunk
      currentChunk = {
        chunkType: detectedType,
        pageStart: page.pageNumber,
        text: page.text,
      };
    }
  }

  // Save last chunk
  if (currentChunk) {
    chunks.push({
      chunkType: currentChunk.chunkType!,
      pageStart: currentChunk.pageStart,
      pageEnd: pages[pages.length - 1].pageNumber,
      text: currentChunk.text,
    });
  }

  return chunks;
}
