import { Module } from '@nestjs/common';
import { CardGeneratorService } from './card-generator.service';
import { CardGeneratorController } from './card-generator.controller';
import { PrismaModule } from '../../../prisma/prisma.module';
import { MailModule } from '../../../mail/mail.module';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [CardGeneratorController],
  providers: [CardGeneratorService],
})
export class CardGeneratorModule { }
