import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  AdminCreateUserDto,
  AdminResetPasswordDto,
  AdminUserListQueryDto,
  ChangePasswordDto,
  StudentListQueryDto,
  UpdateProfileDto,
} from './dto/user.dto';

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
  updateProfile(@CurrentUser() user, @Body() body: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, body);
  }

  /** Throttled: the current-password check here is an online guessing oracle. */
  @ApiOperation({ summary: 'Change password' })
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @Patch('profile/password')
  updatePassword(@CurrentUser() user, @Body() body: ChangePasswordDto) {
    return this.usersService.updatePassword(user.id, body);
  }

  @ApiOperation({ summary: '[Teacher] List all students' })
  @UseGuards(RolesGuard)
  @Roles('teacher', 'admin')
  @Get('students')
  listStudents(@Query() query: StudentListQueryDto) {
    return this.usersService.listStudents(query);
  }

  @ApiOperation({ summary: '[Teacher] Get one student full profile' })
  @UseGuards(RolesGuard)
  @Roles('teacher', 'admin')
  @Get('students/:id')
  getStudentProfile(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getStudentProfile(id);
  }

  /** Staff roster, including work emails — not for students. */
  @ApiOperation({ summary: '[Teacher] List all teachers' })
  @UseGuards(RolesGuard)
  @Roles('teacher', 'admin')
  @Get('teachers')
  listTeachers() {
    return this.usersService.listTeachers();
  }

  /** What a student needs to route a doubt: names and ids, nothing else. */
  @ApiOperation({ summary: 'Teacher picker for the doubt form (names only)' })
  @Get('teachers/directory')
  listTeacherDirectory() {
    return this.usersService.listTeachersForStudents();
  }

  // ─── Admin-only endpoints ──────────────────────────────────────────────────

  @ApiOperation({ summary: '[Admin] List all users with search/role filter' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Get('admin/all')
  listAllUsers(@Query() query: AdminUserListQueryDto) {
    return this.usersService.listAllUsers(query);
  }

  @ApiOperation({ summary: '[Admin] Create a new teacher or student account' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post('admin/create')
  adminCreateUser(@Body() body: AdminCreateUserDto) {
    return this.usersService.adminCreateUser(body);
  }

  @ApiOperation({ summary: "[Admin] Reset any user's password" })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Patch('admin/:id/password')
  adminResetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminResetPasswordDto,
  ) {
    return this.usersService.adminResetPassword(id, body.newPassword);
  }

  @ApiOperation({ summary: '[Admin] Delete a user' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Delete('admin/:id')
  adminDeleteUser(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user) {
    return this.usersService.adminDeleteUser(id, user.id);
  }
}
