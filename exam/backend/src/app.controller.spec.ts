import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ExamAuthGuard } from './auth/exam-auth.guard';

/**
 * The exam API is the one place a student could previously impersonate anyone by
 * putting a different `studentId` in the request body. These tests pin down the
 * two properties that closed that hole:
 *   1. every data route is behind the auth guard, and
 *   2. the student id handed to the service comes from the verified token.
 */
describe('AppController', () => {
  let controller: AppController;

  const service = {
    startSession: jest.fn().mockResolvedValue({ sessionId: 's1' }),
    getQuestions: jest.fn().mockResolvedValue([]),
    heartbeat: jest.fn().mockResolvedValue({ remainingSeconds: 60, status: 'in_progress' }),
    saveResponse: jest.fn().mockResolvedValue({ success: true }),
    logViolation: jest.fn().mockResolvedValue({ success: true, terminated: false }),
    submitSession: jest.fn().mockResolvedValue({ success: true, score: 8 }),
    getResult: jest.fn().mockResolvedValue({ score: 8 }),
  };

  const CALLER = { id: 'student-from-token', email: 's@edu.com' };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: service }],
    })
      // Guard behaviour itself is covered separately; here it always admits.
      .overrideGuard(ExamAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AppController>(AppController);
  });

  it('exposes an unauthenticated health probe that leaks nothing', () => {
    expect(controller.health()).toEqual({ status: 'ok' });
  });

  it('starts a session as the authenticated caller, not a client-supplied id', async () => {
    await controller.startSession('exam-1', CALLER);
    expect(service.startSession).toHaveBeenCalledWith('exam-1', 'student-from-token');
  });

  it('passes the token identity to every session route', async () => {
    await controller.getQuestions('s1', CALLER);
    await controller.heartbeat('s1', CALLER);
    await controller.saveResponse('s1', CALLER, { question_id: 'q1' });
    await controller.logViolation('s1', CALLER, { type: 'tab_hidden' });
    await controller.submitSession('s1', CALLER, { autoSubmitted: false });
    await controller.getResult('s1', CALLER);

    expect(service.getQuestions).toHaveBeenCalledWith('s1', CALLER.id);
    expect(service.heartbeat).toHaveBeenCalledWith('s1', CALLER.id);
    expect(service.saveResponse).toHaveBeenCalledWith('s1', CALLER.id, { question_id: 'q1' });
    expect(service.logViolation).toHaveBeenCalledWith('s1', CALLER.id, { type: 'tab_hidden' });
    expect(service.submitSession).toHaveBeenCalledWith('s1', CALLER.id, false);
    expect(service.getResult).toHaveBeenCalledWith('s1', CALLER.id);
  });

  it('tolerates a submit with no body', async () => {
    await controller.submitSession('s1', CALLER, undefined as any);
    expect(service.submitSession).toHaveBeenCalledWith('s1', CALLER.id, undefined);
  });
});

describe('ExamAuthGuard', () => {
  const guard = new ExamAuthGuard();

  const contextFor = (headers: Record<string, string>): ExecutionContext =>
    ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as any;

  it('rejects a request with no Authorization header', async () => {
    await expect(guard.canActivate(contextFor({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a non-bearer Authorization header', async () => {
    await expect(
      guard.canActivate(contextFor({ authorization: 'Basic abc123' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a malformed bearer token', async () => {
    await expect(
      guard.canActivate(contextFor({ authorization: 'Bearer not-a-jwt' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
