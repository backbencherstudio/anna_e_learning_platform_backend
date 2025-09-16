import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    UsePipes,
    ValidationPipe,
    HttpStatus,
    HttpCode,
    Req,
} from '@nestjs/common';
import { QuizSubmissionService } from './quiz-submission.service';
import { CreateQuizSubmissionDto, SubmitQuizDto } from './dto/create-quiz-submission.dto';
import { UpdateQuizSubmissionDto } from './dto/update-quiz-submission.dto';

@Controller('admin/quiz/submissions')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class QuizSubmissionController {
    constructor(private readonly quizSubmissionService: QuizSubmissionService) { }

    @Post('start')
    @HttpCode(HttpStatus.CREATED)
    async startQuiz(@Body() createQuizSubmissionDto: CreateQuizSubmissionDto, @Req() req: any) {
        const userId = req.user?.id; // Assuming user is attached to request via auth middleware
        return this.quizSubmissionService.startQuiz(createQuizSubmissionDto, userId);
    }

    @Post('save-answers/:submissionId')
    @HttpCode(HttpStatus.OK)
    async saveAnswers(
        @Param('submissionId') submissionId: string,
        @Body() body: { answers: any[] },
        @Req() req: any,
    ) {
        const userId = req.user?.id;
        return this.quizSubmissionService.saveAnswers(submissionId, body.answers, userId);
    }

    @Post('submit')
    @HttpCode(HttpStatus.OK)
    async submitQuiz(@Body() submitQuizDto: SubmitQuizDto, @Req() req: any) {
        const userId = req.user?.id;
        return this.quizSubmissionService.submitQuiz(submitQuizDto, userId);
    }

    @Get()
    @HttpCode(HttpStatus.OK)
    async findAll(
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '10',
        @Query('quiz_id') quiz_id?: string,
        @Query('user_id') user_id?: string,
        @Query('status') status?: string,
        @Query('search') search?: string,
    ) {
        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;
        return this.quizSubmissionService.findAll(pageNum, limitNum, {
            quiz_id,
            user_id,
            status: status as any,
            search,
        });
    }

    @Get(':id')
    @HttpCode(HttpStatus.OK)
    async findOne(@Param('id') id: string, @Req() req: any) {
        const userId = req.user?.id; // For student access, pass userId to filter by user
        return this.quizSubmissionService.findOne(id, userId);
    }

    @Post(':id/grade')
    @HttpCode(HttpStatus.OK)
    async gradeSubmission(
        @Param('id') id: string,
        @Body() gradingData: {
            feedback?: string;
            manual_adjustments?: { answer_id: string; points: number }[];
        },
    ) {
        return this.quizSubmissionService.gradeSubmission(id, gradingData);
    }
}

// Student-facing endpoints (separate controller or can be added to existing one)
@Controller('quiz/submissions')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class StudentQuizSubmissionController {
    constructor(private readonly quizSubmissionService: QuizSubmissionService) { }

    @Post('start')
    @HttpCode(HttpStatus.CREATED)
    async startQuiz(@Body() createQuizSubmissionDto: CreateQuizSubmissionDto, @Req() req: any) {
        const userId = req.user?.id;
        return this.quizSubmissionService.startQuiz(createQuizSubmissionDto, userId);
    }

    @Post('save-answers/:submissionId')
    @HttpCode(HttpStatus.OK)
    async saveAnswers(
        @Param('submissionId') submissionId: string,
        @Body() body: { answers: any[] },
        @Req() req: any,
    ) {
        const userId = req.user?.id;
        return this.quizSubmissionService.saveAnswers(submissionId, body.answers, userId);
    }

    @Post('submit')
    @HttpCode(HttpStatus.OK)
    async submitQuiz(@Body() submitQuizDto: SubmitQuizDto, @Req() req: any) {
        const userId = req.user?.id;
        return this.quizSubmissionService.submitQuiz(submitQuizDto, userId);
    }

    @Get('my-submissions')
    @HttpCode(HttpStatus.OK)
    async getMySubmissions(
        @Req() req: any,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '10',
        @Query('quiz_id') quiz_id?: string,
        @Query('status') status?: string,
    ) {
        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;
        const userId = req.user?.userId;
        return this.quizSubmissionService.findAll(pageNum, limitNum, {
            quiz_id,
            user_id: userId,
            status: status as any,
        });
    }

    @Get(':id')
    @HttpCode(HttpStatus.OK)
    async findOne(@Param('id') id: string, @Req() req: any) {
        const userId = req.user?.id;
        return this.quizSubmissionService.findOne(id, userId);
    }
}
