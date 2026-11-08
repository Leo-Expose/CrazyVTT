// Loads backend/.env, which the database client does not read itself.
import 'dotenv/config';
import { createPrismaClient } from '../src/config/prismaClient';

const prisma = createPrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Seed default spell templates for DND_5E and PF_2E
  try {
    const { seedDefaultSpellTemplates } = await import('../src/services/spellTemplates');
    const dndTemplates = await seedDefaultSpellTemplates('DND_5E');
    const pfTemplates = await seedDefaultSpellTemplates('PF_2E');
    console.log(`✨ Seeded ${dndTemplates.length + pfTemplates.length} default spell templates`);
  } catch (err) {
    console.warn('⚠️ Spell templates seeding skipped or deferred:', err);
  }

  console.log('✅ Database seeding complete');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
