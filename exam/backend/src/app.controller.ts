import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { ExamAuthGuard, CurrentUser } from './auth/exam-auth.guard';

interface Caller {
  id: string;
  email: string;
}

@Controller('api/exam')
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Unauthenticated liveness probe — returns no data. */
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }

  // Everything below requires a verified Supabase session. The student id always
  // comes from the token, never from the request body.
  @UseGuards(ExamAuthGuard)
  @Post(':examId/start')
  startSession(@Param('examId') examId: string, @CurrentUser() user: Caller) {
    return this.appService.startSession(examId, user.id);
  }

  @UseGuards(ExamAuthGuard)
  @Get('session/:sessionId/questions')
  getQuestions(@Param('sessionId') sessionId: string, @CurrentUser() user: Caller) {
    return this.appService.getQuestions(sessionId, user.id);
  }

  @UseGuards(ExamAuthGuard)
  @Get('session/:sessionId/heartbeat')
  heartbeat(@Param('sessionId') sessionId: string, @CurrentUser() user: Caller) {
    return this.appService.heartbeat(sessionId, user.id);
  }

  @UseGuards(ExamAuthGuard)
  @Post('session/:sessionId/response')
  saveResponse(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: Caller,
    @Body() body: any,
  ) {
    return this.appService.saveResponse(sessionId, user.id, body);
  }

  @UseGuards(ExamAuthGuard)
  @Post('session/:sessionId/violation')
  logViolation(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: Caller,
    @Body() body: any,
  ) {
    return this.appService.logViolation(sessionId, user.id, body);
  }

  @UseGuards(ExamAuthGuard)
  @Post('session/:sessionId/submit')
  submitSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: Caller,
    @Body() body: { autoSubmitted?: boolean },
  ) {
    return this.appService.submitSession(sessionId, user.id, body?.autoSubmitted);
  }

  @UseGuards(ExamAuthGuard)
  @Get('session/:sessionId/result')
  getResult(@Param('sessionId') sessionId: string, @CurrentUser() user: Caller) {
    return this.appService.getResult(sessionId, user.id);
  }
}
