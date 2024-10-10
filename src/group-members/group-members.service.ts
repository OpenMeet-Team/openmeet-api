import { Inject, Injectable, NotFoundException, Scope } from "@nestjs/common";
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupMemberEntity } from "./infrastructure/persistence/relational/entities/group-member.entity";
import { Repository } from "typeorm";
import { CreateGroupMemberDto } from "./dto/create-groupMember.dto";
import { REQUEST } from "@nestjs/core";

@Injectable({ scope: Scope.REQUEST, durable: true })
export class GroupMemberService{
    private groupMemberRepository: Repository<GroupMemberEntity>;
    constructor(
      @Inject(REQUEST) private readonly request: any,
      private readonly tenantConnectionService: TenantConnectionService,
    ) {}
  
    async getTenantSpecificEventRepository() {
      const tenantId = this.request.tenantId;
      const dataSource =
        await this.tenantConnectionService.getTenantConnection(tenantId);
      this.groupMemberRepository = dataSource.getRepository(GroupMemberEntity);
    }
 
    async joinGroup (createDto: CreateGroupMemberDto){
        await this.getTenantSpecificEventRepository()
        const group = {id: createDto.groupId}
        const user= {id: createDto.userId}
        const groupRole = {id: createDto.groupRoleId}
        const mappedDto ={
            ...createDto,
            user,
            group,
            groupRole
        }
        const groupMember = this.groupMemberRepository.create(mappedDto);
        return await this.groupMemberRepository.save(groupMember);
    }

    async leaveGroup(userId: number, groupId: number): Promise<any> {
        await this.getTenantSpecificEventRepository();
        const groupMember = await this.groupMemberRepository.findOne({
          where: { user: { id: userId }, group: { id: groupId } },
          relations: ['user', 'group'],
        });
    
        if (!groupMember) {
          throw new NotFoundException('User is not a member of this group');
        }
    
        await this.groupMemberRepository.remove(groupMember);
        return { message: 'User has left the group successfully' };
      }

}