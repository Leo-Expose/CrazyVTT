/**
 * D&D 5e Game Data Index
 * Exports all races, classes, and utility functions
 */

export * from './races';
export * from './classes';
export * from './backgrounds';
export * from './armorLogistics';

// Re-export types
export type {
  RaceData,
  RaceFeature,
  ClassData,
  ClassFeature,
  SubclassData,
  SavingThrowProficiency,
  SkillProficiencyOption,
  ClassSpellcasting,
} from './races';

export type { ClassData as DnD5eClassData, SubclassData as DnD5eSubclassData } from './classes';
export type { RaceData as DnD5eRaceData } from './races';