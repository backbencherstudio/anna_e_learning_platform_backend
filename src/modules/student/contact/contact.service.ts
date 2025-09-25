import { Injectable, Logger } from '@nestjs/common';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(private readonly prisma: PrismaService) { }

  async create(createContactDto: CreateContactDto) {
    try {
      this.logger.log('Creating new contact request');

      const contact = await this.prisma.contact.create({
        data: {
          first_name: createContactDto.first_name || null,
          last_name: createContactDto.last_name || null,
          email: createContactDto.email || null,
          phone_number: createContactDto.phone_number || null,
          whatsapp_number: createContactDto.whatsapp_number || null,
          reason: createContactDto.reason || null,
          message: createContactDto.message || null,
          date: createContactDto.date ? new Date(createContactDto.date) : null,
          status: 'pending',
        },
      });

      this.logger.log(`Contact request created with ID: ${contact.id}`);

      return {
        success: true,
        message: 'Contact request submitted successfully',
        data: contact,
      };
    } catch (error) {
      this.logger.error(`Error creating contact request: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Failed to submit contact request',
        error: error.message,
      };
    }
  }
}
