import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNewCategories1760526653000 implements MigrationInterface {
  name = 'AddNewCategories1760526653000';

  // List of new categories to add (based on Meetup.com's proven categories)
  // Note: 5 categories already exist and will be renamed in a future migration
  private readonly newCategories = [
    'Community & Environment',
    'Dancing',
    'Gaming',
    'Hobbies & Crafts',
    'Language & Culture',
    'Politics & Activism',
    'Music',
    'Family & Parenting',
    'Pets & Animals',
    'Spirituality & Religion',
    'Social Activities',
    'Sports & Recreation',
    'Support & Coaching',
    'Travel & Outdoors',
    'Writing',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    console.log(`Adding ${this.newCategories.length} new categories to ${schema}...`);

    for (const categoryName of this.newCategories) {
      const slug = categoryName.toLowerCase().replace(/\s+/g, '-').replace(/&/g, 'and');

      // Check if category exists
      const exists = await queryRunner.query(
        `SELECT 1 FROM "${schema}"."categories" WHERE name = $1 LIMIT 1`,
        [categoryName],
      );

      // Insert category only if it doesn't exist
      if (exists.length === 0) {
        await queryRunner.query(
          `
          INSERT INTO "${schema}"."categories" (name, slug, "createdAt", "updatedAt")
          VALUES ($1, $2, NOW(), NOW())
          `,
          [categoryName, slug],
        );
        console.log(`  ✓ Added category: ${categoryName}`);
      } else {
        console.log(`  ⊘ Category already exists: ${categoryName}`);
      }
    }

    console.log(`✅ Successfully added new categories to ${schema}`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    console.log(`Removing ${this.newCategories.length} categories from ${schema}...`);

    for (const categoryName of this.newCategories) {
      // Delete the category (will cascade to subcategories if configured)
      await queryRunner.query(
        `
        DELETE FROM "${schema}"."categories"
        WHERE name = $1;
        `,
        [categoryName],
      );

      console.log(`  ✓ Removed category: ${categoryName}`);
    }

    console.log(`✅ Successfully removed categories from ${schema}`);
  }
}
