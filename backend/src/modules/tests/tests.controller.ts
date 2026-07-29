import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TestsService } from './tests.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Tests')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('api/tests')
export class TestsController {
  constructor(private readonly testsService: TestsService) {}

  // ─── Teacher Routes ────────────────────────────────────────────────────────

  @ApiOperation({ summary: '[Teacher] Create a full test (Metadata + Questions + Assignment)' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Post('constructor')
  saveFullTest(@Body() body: any, @CurrentUser() user) {
    return this.testsService.saveFullTest(body, user);
  }

  @ApiOperation({ summary: '[Teacher] List all tests' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Get()
  findAll(@CurrentUser() user, @Query('status') status?: string) {
    return this.testsService.findAll(user.id, status);
  }

  @ApiOperation({ summary: '[Teacher] Create new test' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Post()
  create(@Body() body: any, @CurrentUser() user) {
    return this.testsService.create(body, user.id);
  }

  @ApiOperation({ summary: '[Teacher] Publish a draft test' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Patch(':id/publish')
  publish(@Param('id') id: string, @CurrentUser() user: any) {
    return this.testsService.publish(id, user);
  }

  @ApiOperation({ summary: '[Teacher] Add/replace questions on a test' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Post(':id/questions')
  addQuestions(@Param('id') id: string, @Body() body: { question_ids: string[] }, @CurrentUser() user) {
    return this.testsService.addQuestions(id, body.question_ids, user);
  }

  @ApiOperation({ summary: '[Teacher] Assign test to batches with schedule' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Post(':id/assign')
  assign(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.testsService.assign(id, body, user);
  }

  @ApiOperation({ summary: '[Teacher] Get all student results for a test' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Get(':id/results')
  getResults(@Param('id') id: string) {
    return this.testsService.getResults(id);
  }

  @ApiOperation({ summary: '[Teacher] Update test metadata' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.testsService.update(id, body, user);
  }

  @ApiOperation({ summary: '[Teacher] Delete a test' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.testsService.remove(id, user);
  }

  // ─── Student Routes ────────────────────────────────────────────────────────

  @ApiOperation({ summary: '[Student] Get tests assigned to this student' })
  @UseGuards(RolesGuard) @Roles('student')
  @Get('available')
  getStudentTests(@CurrentUser() user) {
    return this.testsService.getStudentTests(user.id);
  }

  @ApiOperation({ summary: '[Student] Get test questions (no correct answers)' })
  @UseGuards(RolesGuard) @Roles('student')
  @Get(':id/questions')
  getQuestionsForStudent(@Param('id') id: string) {
    return this.testsService.getTestQuestionsForStudent(id);
  }

  @ApiOperation({ summary: 'Get test details' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.testsService.findOne(id);
  }
}
