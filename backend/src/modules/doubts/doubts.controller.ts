import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { DoubtsService } from './doubts.service';
import { DoubtsGateway } from './doubts.gateway';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateDoubtDto, DoubtQueueQueryDto, SendMessageDto } from './dto/doubt.dto';

const ALLOWED_UPLOAD_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

@ApiTags('Doubts')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('api/doubts')
export class DoubtsController {
  constructor(
    private readonly doubtsService: DoubtsService,
    private readonly doubtsGateway: DoubtsGateway,
  ) {}

  @ApiOperation({ summary: '[Student] Submit a new doubt' })
  @UseGuards(RolesGuard) @Roles('student')
  @Post()
  create(@CurrentUser() user, @Body() body: CreateDoubtDto) {
    return this.doubtsService.create(user.id, body);
  }

  @ApiOperation({ summary: '[Student] Get own doubts history' })
  @UseGuards(RolesGuard) @Roles('student')
  @Get('my')
  getMyDoubts(@CurrentUser() user) {
    return this.doubtsService.getMyDoubts(user.id);
  }

  @ApiOperation({ summary: '[Teacher] Get doubts queue (unclaimed + own)' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Get()
  findAll(@CurrentUser() user, @Query() query: DoubtQueueQueryDto) {
    return this.doubtsService.findAll(user, query.status);
  }

  @ApiOperation({ summary: 'Get one doubt details (participants only)' })
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user) {
    return this.doubtsService.findOne(id, user);
  }

  @ApiOperation({ summary: '[Teacher] Accept a doubt (take ownership)' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Patch(':id/accept')
  async accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user) {
    const doubt = await this.doubtsService.accept(id, user);
    this.doubtsGateway.notifyStatusChange(id, 'accepted');
    return doubt;
  }

  @ApiOperation({ summary: '[Teacher] Mark doubt as resolved' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Patch(':id/resolve')
  async resolve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user) {
    const doubt = await this.doubtsService.resolve(id, user);
    this.doubtsGateway.notifyStatusChange(id, 'resolved');
    return doubt;
  }

  @ApiOperation({ summary: 'Get chat messages for a doubt (participants only)' })
  @Get(':id/messages')
  getMessages(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user) {
    return this.doubtsService.getMessages(id, user);
  }

  @ApiOperation({ summary: 'Send a message (REST fallback when Socket.IO not available)' })
  @Post(':id/messages')
  sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user,
    @Body() body: SendMessageDto,
  ) {
    return this.doubtsService.sendMessage(id, user, body.message_text);
  }

  @ApiOperation({ summary: 'Upload an image to a doubt chat' })
  @ApiConsumes('multipart/form-data')
  @Post(':id/upload-image')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_UPLOAD_MIME.includes(file.mimetype)) {
          return cb(new BadRequestException('Only JPG, PNG, GIF and WEBP images are supported.'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadImage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const result = await this.doubtsService.uploadImage(id, user, file);
    const { imageUrl, ...message } = result;

    // Broadcast here rather than letting the uploader re-send it over the socket,
    // which would store the same image twice.
    this.doubtsGateway.broadcastMessage(id, message, {
      id: user.id,
      full_name: user.full_name,
      role: user.role,
    });
    return result;
  }

  @ApiOperation({ summary: 'Delete a doubt' })
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user) {
    return this.doubtsService.remove(id, user);
  }
}
