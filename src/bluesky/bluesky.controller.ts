import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  Logger,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { BlueskyService } from './bluesky.service';
import { LoginDto } from './dto/login.dto';

@Controller('bluesky')
export class BlueskyController {
  private readonly logger = new Logger(BlueskyController.name);

  constructor(private readonly blueskyService: BlueskyService) {}

  @Post('login')
  async login(@Body() body: any) {
    this.logger.debug('Raw request body:', JSON.stringify(body, null, 2));
    const loginDto: LoginDto = {
      identifier: body.identifier,
      password: body.password,
    };
    return this.blueskyService.login(loginDto);
  }

  @Post('post')
  @UseInterceptors(FilesInterceptor('images'))
  async createPost(
    @Body('text') text: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const images = files?.map((file) => ({
      data: file.buffer,
      alt: file.originalname,
    }));
    return this.blueskyService.createPost(text, images);
  }

  @Get('timeline')
  async getTimeline(@Query('limit') limit?: number) {
    return this.blueskyService.getTimeline(limit || 5);
  }

  @Post('follow/:handle')
  async followUser(@Param('handle') handle: string) {
    return this.blueskyService.followUser(handle);
  }

  @Post('like')
  async likePost(@Body() body: { uri: string; cid: string }) {
    return this.blueskyService.likePost(body.uri, body.cid);
  }

  @Get('notifications')
  async getNotifications(@Query('limit') limit?: number) {
    return this.blueskyService.getNotifications(limit);
  }
}
