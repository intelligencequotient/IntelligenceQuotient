import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AttemptsService } from './attempts.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  LogViolationDto,
  SaveAnswerDto,
  SubmitAttemptDto,
  ToggleFlagDto,
} from './dto/attempt.dto';

@ApiTags('Attempts')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('student')
@Controller('api/attempts')
export class AttemptsController {
  constructor(private readonly attemptsService: AttemptsService) {}

  @ApiOperation({ summary: 'Start a test attempt (or resume if already started)' })
  @Post('start/:testId')
  startAttempt(@Param('testId', ParseUUIDPipe) testId: string, @CurrentUser() user) {
    return this.attemptsService.startAttempt(testId, user.id);
  }

  @ApiOperation({ summary: "Get all of student's past attempts" })
  @Get('my')
  getMyAttempts(@CurrentUser() user) {
    return this.attemptsService.getMyAttempts(user.id);
  }

  @ApiOperation({ summary: 'Save/update one answer during the exam' })
  @Patch(':id/answer')
  saveAnswer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user,
    @Body() body: SaveAnswerDto,
  ) {
    return this.attemptsService.saveAnswer(id, user.id, body);
  }

  @ApiOperation({ summary: 'Record a proctoring violation — terminates the attempt on the 3rd' })
  @Post(':id/violation')
  logViolation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user,
    @Body() body: LogViolationDto,
  ) {
    return this.attemptsService.logViolation(id, user.id, body);
  }

  @ApiOperation({ summary: 'Toggle flag a question for doubt review' })
  @Patch(':id/flag')
  toggleFlag(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user,
    @Body() body: ToggleFlagDto,
  ) {
    return this.attemptsService.toggleFlag(id, user.id, body.question_id, body.flagged);
  }

  @ApiOperation({ summary: 'Submit the exam — backend calculates score' })
  @Post(':id/submit')
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user,
    @Body() body: SubmitAttemptDto,
  ) {
    return this.attemptsService.submitAttempt(id, user.id, body.autoSubmitted);
  }

  @ApiOperation({ summary: 'Get result of a specific attempt (for PostTestResult page)' })
  @Get(':id')
  getResult(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user) {
    return this.attemptsService.getAttemptResult(id, user.id);
  }
}
