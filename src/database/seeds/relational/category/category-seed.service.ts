import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TenantConnectionService } from '../../../../tenant/tenant.service';
import { CategoryEntity } from '../../../../categories/infrastructure/persistence/relational/entities/categories.entity';

@Injectable()
export class CategorySeedService {
  private repository: Repository<CategoryEntity>;

  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  async run(tenantId: string) {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.repository = dataSource.getRepository(CategoryEntity);

    const countCategories = await this.repository.count();

    if (!countCategories) {
      const defaultCategories = [
        {
          name: 'Technology',
          slug: 'technology',
        },
        {
          name: 'Health',
          slug: 'health',
        },
        {
          name: 'Finance',
          slug: 'finance',
        },
        {
          name: 'Education',
          slug: 'education',
        },
      ];

      for (const category of defaultCategories) {
        await this.repository.save(
          this.repository.create({
            name: category.name,
            slug: category.slug,
          }),
        );
      }
    }
  }
}
