import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LeaderboardService } from './leaderboard.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Leaderboard')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('api/leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @ApiOperation({ summary: 'Global all-student leaderboard' })
  @Get()
  getGlobal(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.leaderboardService.getGlobal(page, limit);
  }

  @ApiOperation({ summary: "Get logged-in student's rank + neighbors" })
  @Get('me')
  getMyRank(@CurrentUser() user) {
    return this.leaderboardService.getMyRank(user.id);
  }

  @ApiOperation({ summary: 'Batch-specific leaderboard' })
  @Get('batch/:batchId')
  getBatch(@Param('batchId') batchId: string) {
    return this.leaderboardService.getBatch(batchId);
  }
}
