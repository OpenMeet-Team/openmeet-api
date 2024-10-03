import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TenantConnectionService } from '../../../../tenant/tenant.service';
import { CategoryEntity } from '../../../../categories/infrastructure/persistence/relational/entities/categories.entity';
import { SubCategoryEntity } from '../../../../sub-categories/infrastructure/persistence/relational/entities/sub-categories.entity';
import { SubCategoryType } from '../../../../core/constants/constant';

@Injectable()
export class CategorySeedService {
  private categoryRepository: Repository<CategoryEntity>;
  private subCategoryRepository: Repository<SubCategoryEntity>;

  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  async run(tenantId: string) {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.categoryRepository = dataSource.getRepository(CategoryEntity);
    this.subCategoryRepository = dataSource.getRepository(SubCategoryEntity);

    const seedData = [
      {
        category: 'Technology',
        subcategories: [
          {
            title: 'Workshops & Tutorials',
            description: 'Hands-on sessions for learning new technologies.',
            type: SubCategoryType.EVENT, // Use the enum
          },
          {
            title: 'Seminars & Talks',
            description: 'Presentations on latest tech trends and innovations.',
            type: SubCategoryType.EVENT, // Use the enum
          },
          {
            title: 'Hackathons',
            description: 'Collaborative coding events to solve challenges.',
            type: SubCategoryType.EVENT, // Use the enum
          },
          {
            title: 'Webinars',
            description: 'Online seminars covering diverse tech topics.',
            type: SubCategoryType.EVENT, // Use the enum
          },
          {
            title: 'Developers & Programmers',
            description:
              'Groups for coding enthusiasts and software developers.',
            type: SubCategoryType.GROUP, // Use the enum
          },
          {
            title: 'AI & Data Science',
            description:
              'Communities focused on artificial intelligence and data analytics.',
            type: SubCategoryType.GROUP, // Use the enum
          },
          {
            title: 'Cybersecurity',
            description:
              'Groups dedicated to cybersecurity professionals and enthusiasts.',
            type: SubCategoryType.GROUP, // Use the enum
          },
          {
            title: 'Tech Innovators',
            description:
              'Communities for discussing and developing new technologies.',
            type: SubCategoryType.GROUP, // Use the enum
          },
        ],
      },
      {
        category: 'Business & Entrepreneurship',
        subcategories: [
          {
            title: 'Networking Events',
            description:
              'Opportunities to connect with professionals and entrepreneurs.',
            type: SubCategoryType.EVENT, // Use the enum
          },
          {
            title: 'Pitch Nights',
            description:
              'Platforms for startups to present their ideas to investors.',
            type: SubCategoryType.EVENT, // Use the enum
          },
          {
            title: 'Workshops',
            description:
              'Skill-building sessions on marketing, finance, leadership, etc.',
            type: SubCategoryType.EVENT, // Use the enum
          },
          {
            title: 'Conferences',
            description:
              'Large gatherings focused on business strategies and industry trends.',
            type: SubCategoryType.EVENT, // Use the enum
          },
          {
            title: 'Startup Founders',
            description: 'Groups for entrepreneurs launching new ventures.',
            type: SubCategoryType.GROUP, // Use the enum
          },
          {
            title: 'Marketing Professionals',
            description:
              'Communities for sharing marketing strategies and trends.',
            type: SubCategoryType.GROUP, // Use the enum
          },
          {
            title: 'Finance & Investment',
            description:
              'Groups focused on personal finance, investing, and financial planning.',
            type: SubCategoryType.GROUP, // Use the enum
          },
          {
            title: 'Business Leaders',
            description:
              'Communities for executives and managers to share leadership insights.',
            type: SubCategoryType.GROUP, // Use the enum
          },
        ],
      },
      {
        category: 'Health & Wellness',
        subcategories: [
          {
            title: 'Fitness Classes',
            description:
              'Group workouts, yoga sessions, and fitness challenges.',
            type: SubCategoryType.EVENT, // Use the enum
          },
          {
            title: 'Workshops',
            description:
              'Sessions on nutrition, mental health, and holistic wellness.',
            type: SubCategoryType.EVENT, // Use the enum
          },
          {
            title: 'Seminars',
            description: 'Talks by health experts on various wellness topics.',
            type: SubCategoryType.EVENT, // Use the enum
          },
          {
            title: 'Support Groups',
            description:
              'Meetings for sharing and support on mental health and wellness.',
            type: SubCategoryType.EVENT, // Use the enum
          },
          {
            title: 'Fitness Enthusiasts',
            description:
              'Groups for sharing workout routines and fitness goals.',
            type: SubCategoryType.GROUP, // Use the enum
          },
          {
            title: 'Mental Health Support',
            description:
              'Communities offering support and resources for mental well-being.',
            type: SubCategoryType.GROUP, // Use the enum
          },
          {
            title: 'Nutrition & Diet',
            description: 'Groups focused on healthy eating and nutrition tips.',
            type: SubCategoryType.GROUP, // Use the enum
          },
          {
            title: 'Yoga & Meditation',
            description: 'Communities practicing yoga and mindfulness.',
            type: SubCategoryType.GROUP, // Use the enum
          },
        ],
      },
      {
        category: 'Arts & Culture',
        subcategories: [
          {
            title: 'Performances',
            description:
              'Concerts, theater plays, dance shows, and open mic nights.',
            type: SubCategoryType.EVENT, // Use the enum
          },
          {
            title: 'Workshops',
            description:
              'Creative classes for painting, photography, writing, etc.',
            type: SubCategoryType.EVENT, // Use the enum
          },
          {
            title: 'Exhibitions',
            description: 'Showcases of visual arts, photography, and crafts.',
            type: SubCategoryType.EVENT, // Use the enum
          },
          {
            title: 'Film Screenings',
            description: 'Movie nights and filmmaker discussions.',
            type: SubCategoryType.EVENT, // Use the enum
          },
          {
            title: 'Musicians & Performers',
            description:
              'Groups for sharing music, organizing performances, and collaborating.',
            type: SubCategoryType.GROUP, // Use the enum
          },
          {
            title: 'Visual Artists',
            description:
              'Communities for painters, photographers, and other visual artists.',
            type: SubCategoryType.GROUP, // Use the enum
          },
          {
            title: 'Writers & Poets',
            description:
              'Groups for sharing written works and providing feedback.',
            type: SubCategoryType.GROUP, // Use the enum
          },
          {
            title: 'Film & Theater Enthusiasts',
            description:
              'Communities for discussing films, plays, and organizing screenings.',
            type: SubCategoryType.GROUP, // Use the enum
          },
        ],
      },
      {
        category: 'Education & Learning',
        subcategories: [
          {
            title: 'Classes & Courses',
            description: 'Structured learning sessions on various subjects.',
            type: SubCategoryType.EVENT, // Use the enum
          },
          {
            title: 'Workshops',
            description:
              'Interactive sessions for skill development and hands-on learning.',
            type: SubCategoryType.EVENT, // Use the enum
          },
          {
            title: 'Seminars & Lectures',
            description: 'Educational talks by experts in different fields.',
            type: SubCategoryType.EVENT, // Use the enum
          },
          {
            title: 'Study Groups',
            description: 'Collaborative learning and discussion groups.',
            type: SubCategoryType.EVENT, // Use the enum
          },
          {
            title: 'Language Learners',
            description: 'Groups for practicing and learning new languages.',
            type: SubCategoryType.GROUP, // Use the enum
          },
          {
            title: 'STEM Enthusiasts',
            description:
              'Communities focused on science, technology, engineering, and math.',
            type: SubCategoryType.GROUP, // Use the enum
          },
          {
            title: 'Professional Development',
            description:
              'Groups for career growth, skill-building, and networking.',
            type: SubCategoryType.GROUP, // Use the enum
          },
          {
            title: 'Study Groups',
            description:
              'Communities for collaborative learning and academic support.',
            type: SubCategoryType.GROUP, // Use the enum
          },
        ],
      },
    ];

    for (const categoryData of seedData) {
      let category = await this.categoryRepository.findOne({
        where: { name: categoryData.category },
      });

      if (!category) {
        category = this.categoryRepository.create({
          name: categoryData.category,
        });
        await this.categoryRepository.save(category);
      }

      for (const subcategoryData of categoryData.subcategories) {
        const existingSubCategory = await this.subCategoryRepository.findOne({
          where: { title: subcategoryData.title, category },
        });

        if (!existingSubCategory) {
          const subcategory = this.subCategoryRepository.create({
            title: subcategoryData.title,
            description: subcategoryData.description,
            type: subcategoryData.type,
            category, // Associate with the category
          });

          await this.subCategoryRepository.save(subcategory);
        }
      }
    }
  }
}
