import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('api/exam')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post(':examId/start')
  startSession(@Param('examId') examId: string, @Body() body: { studentId: string }) {
    return this.appService.startSession(examId, body.studentId);
  }

  @Get('session/:sessionId/heartbeat')
  heartbeat(@Param('sessionId') sessionId: string) {
    return this.appService.heartbeat(sessionId);
  }

  @Post('session/:sessionId/response')
  saveResponse(@Param('sessionId') sessionId: string, @Body() body: any) {
    return this.appService.saveResponse(sessionId, body);
  }

  @Post('session/:sessionId/violation')
  logViolation(@Param('sessionId') sessionId: string, @Body() body: any) {
    return this.appService.logViolation(sessionId, body);
  }

  @Post('session/:sessionId/submit')
  submitSession(@Param('sessionId') sessionId: string, @Body() body: any) {
    return this.appService.submitSession(sessionId, body.autoSubmitted);
  }
}
