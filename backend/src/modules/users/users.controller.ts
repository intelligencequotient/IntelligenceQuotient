import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
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

  @ApiOperation({ summary: 'Change password' })
  @Patch('profile/password')
  updatePassword(@CurrentUser() user, @Body() body: { currentPassword?: string; newPassword: string }) {
    return this.usersService.updatePassword(user.id, body);
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

  @ApiOperation({ summary: 'List all teachers' })
  @Get('teachers')
  listTeachers() {
    return this.usersService.listTeachers();
  }

  // ─── Admin-only endpoints ──────────────────────────────────────────────────

  @ApiOperation({ summary: '[Admin] List all users with search/role filter' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Get('admin/all')
  listAllUsers(
    @Query('search') search?: string,
    @Query('role') role?: string,
  ) {
    return this.usersService.listAllUsers({ search, role });
  }

  @ApiOperation({ summary: '[Admin] Create a new teacher or student account' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post('admin/create')
  adminCreateUser(
    @Body() body: { full_name: string; email: string; password: string; role: 'student' | 'teacher' },
  ) {
    return this.usersService.adminCreateUser(body);
  }

  @ApiOperation({ summary: '[Admin] Reset any user\'s password' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Patch('admin/:id/password')
  adminResetPassword(@Param('id') id: string, @Body() body: { newPassword: string }) {
    return this.usersService.adminResetPassword(id, body.newPassword);
  }

  @ApiOperation({ summary: '[Admin] Delete a user' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Delete('admin/:id')
  adminDeleteUser(@Param('id') id: string) {
    return this.usersService.adminDeleteUser(id);
  }
}

