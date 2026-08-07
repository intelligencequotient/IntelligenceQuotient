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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TestsService } from './tests.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  AssignTeachersDto,
  AssignTestDto,
  CreateTestDto,
  SaveFullTestDto,
  TestListQueryDto,
  TestQuestionsDto,
  UpdateTestDto,
} from './dto/test.dto';

@ApiTags('Tests')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('api/tests')
export class TestsController {
  constructor(private readonly testsService: TestsService) {}

  // ─── Teacher Routes ────────────────────────────────────────────────────────

  /**
   * Creating a test is an admin action.
   *
   * Papers are initiated centrally and teachers are then assigned to fill in
   * the questions for their subject — see POST /:id/questions, which stays open
   * to an assigned teacher. Without this restriction the Test Constructor page
   * being hidden from the teacher sidebar would be decoration: the endpoint was
   * still there for anyone who kept the URL or called the API directly.
   */
  @ApiOperation({ summary: '[Admin] Create a full test (Metadata + Questions + Assignment)' })
  @UseGuards(RolesGuard) @Roles('admin')
  @Post('constructor')
  saveFullTest(@Body() body: SaveFullTestDto, @CurrentUser() user) {
    return this.testsService.saveFullTest(body, user);
  }

  @ApiOperation({ summary: '[Teacher] List all tests' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Get()
  findAll(@CurrentUser() user, @Query() query: TestListQueryDto) {
    return this.testsService.findAll(user, query);
  }

  @ApiOperation({ summary: '[Admin] Create a new test shell' })
  @UseGuards(RolesGuard) @Roles('admin')
  @Post()
  create(@Body() body: CreateTestDto, @CurrentUser() user) {
    return this.testsService.create(body, user);
  }

  // ─── Student Routes ────────────────────────────────────────────────────────
  // Declared before the `:id` routes so `available` is never read as a test id.

  @ApiOperation({ summary: '[Student] Get tests assigned to this student' })
  @UseGuards(RolesGuard) @Roles('student')
  @Get('available')
  getStudentTests(@CurrentUser() user) {
    return this.testsService.getStudentTests(user.id);
  }

  // ─── Parameterised routes ──────────────────────────────────────────────────

  @ApiOperation({ summary: '[Teacher] Publish a draft test' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Patch(':id/publish')
  publish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.testsService.publish(id, user);
  }

  /** Stays open to teachers: filling in a paper's questions is their job. */
  @ApiOperation({ summary: '[Teacher] Add/replace questions on a test you own or are assigned' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Post(':id/questions')
  addQuestions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: TestQuestionsDto,
    @CurrentUser() user,
  ) {
    return this.testsService.addQuestions(id, body.question_ids, user);
  }

  @ApiOperation({ summary: '[Admin] Assign teachers (multi) to fill questions for this test' })
  @UseGuards(RolesGuard) @Roles('admin')
  @Patch(':id/assign-teacher')
  assignTeachers(@Param('id', ParseUUIDPipe) id: string, @Body() body: AssignTeachersDto) {
    return this.testsService.assignTeachers(id, body.teacher_ids ?? []);
  }

  @ApiOperation({ summary: '[Teacher] Assign test to batches with schedule' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Post(':id/assign')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignTestDto,
    @CurrentUser() user: any,
  ) {
    return this.testsService.assign(id, body, user);
  }

  @ApiOperation({ summary: '[Teacher] Get all student results for a test' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Get(':id/results')
  getResults(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.testsService.getResults(id, user);
  }

  @ApiOperation({ summary: '[Student] Get test questions (no correct answers)' })
  @UseGuards(RolesGuard) @Roles('student')
  @Get(':id/questions')
  getQuestionsForStudent(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.testsService.getTestQuestionsForStudent(id, user.id);
  }

  @ApiOperation({ summary: '[Teacher] Update test metadata' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTestDto,
    @CurrentUser() user: any,
  ) {
    return this.testsService.update(id, body, user);
  }

  @ApiOperation({ summary: '[Teacher] Delete a test' })
  @UseGuards(RolesGuard) @Roles('teacher', 'admin')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.testsService.remove(id, user);
  }

  /**
   * Test details. Staff get the paper for editing; a student only gets it when
   * they are assigned and the window is open — enforced in the service.
   */
  @ApiOperation({ summary: 'Get test details' })
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.testsService.findOne(id, user);
  }
}
