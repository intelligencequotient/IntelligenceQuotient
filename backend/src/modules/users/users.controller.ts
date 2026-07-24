import { Controller, Get, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Get your own profile' })
  @Get('profile')
  getProfile(@CurrentUser() user) {
    return this.usersService.getProfile(user.id);
  }

  @ApiOperation({ summary: 'Update your name' })
  @Patch('profile')
  updateProfile(@CurrentUser() user, @Body() body: { full_name: string }) {
    return this.usersService.updateProfile(user.id, body);
  }

  @ApiOperation({ summary: '[Teacher] List all students' })
  @UseGuards(RolesGuard)
  @Roles('teacher', 'admin')
  @Get('students')
  listStudents(
    @Query('search') search?: string,
    @Query('batchId') batchId?: string,
  ) {
    return this.usersService.listStudents({ search, batchId });
  }

  @ApiOperation({ summary: '[Teacher] Get one student full profile' })
  @UseGuards(RolesGuard)
  @Roles('teacher', 'admin')
  @Get('students/:id')
  getStudentProfile(@Param('id') id: string) {
    return this.usersService.getStudentProfile(id);
  }
}
