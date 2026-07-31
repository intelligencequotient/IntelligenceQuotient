import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DoubtsService } from './doubts.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Doubts')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('api/doubts')
export class DoubtsController {
  constructor(private readonly doubtsService: DoubtsService) {}

  @ApiOperation({ summary: '[Student] Submit a new doubt' })
  @UseGuards(RolesGuard) @Roles('student')
  @Post()
  create(@CurrentUser() user, @Body() body: any) {
    return this.doubtsService.create(user.id, body);
  }

  @ApiOperation({ summary: '[Student] Get own doubts history' })
  @UseGuards(RolesGuard) @Roles('student')
  @Get('my')
  getMyDoubts(@CurrentUser() user) {
    return this.doubtsService.getMyDoubts(user.id);
  }

  @ApiOperation({ summary: '[Teacher] Get all doubts queue' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Get()
  findAll(@Query('status') status?: string) {
    return this.doubtsService.findAll(status);
  }

  @ApiOperation({ summary: 'Get one doubt details' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.doubtsService.findOne(id);
  }

  @ApiOperation({ summary: '[Teacher] Accept a doubt (take ownership)' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Patch(':id/accept')
  accept(@Param('id') id: string, @CurrentUser() user) {
    return this.doubtsService.accept(id, user.id);
  }

  @ApiOperation({ summary: '[Teacher] Mark doubt as resolved' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Patch(':id/resolve')
  resolve(@Param('id') id: string) {
    return this.doubtsService.resolve(id);
  }

  @ApiOperation({ summary: 'Get chat messages for a doubt' })
  @Get(':id/messages')
  getMessages(@Param('id') id: string) {
    return this.doubtsService.getMessages(id);
  }

  @ApiOperation({ summary: 'Send a message (REST fallback when Socket.IO not available)' })
  @Post(':id/messages')
  sendMessage(@Param('id') id: string, @CurrentUser() user, @Body() body: { message_text: string }) {
    return this.doubtsService.sendMessage(id, user.id, body.message_text);
  }
}
