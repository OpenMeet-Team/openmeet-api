import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TenantConnectionService } from '../../../../tenant/tenant.service';
import { InterestEntity } from '../../../../interests/infrastructure/persistence/relational/entities/interests.entity';
import { CategoryEntity } from '../../../../categories/infrastructure/persistence/relational/entities/categories.entity';

@Injectable()
export class InterestSeedService {
  private repository: Repository<InterestEntity>;
  private categoryRepository: Repository<CategoryEntity>;

  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  async run(tenantId: string) {
    const dataSource = await this.tenantConnectionService.getTenantConnection(tenantId);
    
    this.repository = dataSource.getRepository(InterestEntity);
    this.categoryRepository = dataSource.getRepository(CategoryEntity);

    const countInterests = await this.repository.count();

    if (!countInterests) {
      const categories = await this.categoryRepository.find();

      const defaultInterests = [
        {
          name: 'AI and Machine Learning',
          categoryName: 'Technology',
        },
        {
          name: 'Nutrition and Wellness',
          categoryName: 'Health',
        },
        {
          name: 'Personal Finance',
          categoryName: 'Finance',
        },
        {
          name: 'E-learning Platforms',
          categoryName: 'Education',
        },
      ];

      for (const interest of defaultInterests) {
        const category = categories.find(cat => cat.name === interest.categoryName);

        if (category) {
          await this.repository.save(
            this.repository.create({
              name: interest.name,
              category,
            }),
          );
        }
      }
    }
  }
}
