import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(private readonly prisma: PrismaService) { }

  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    status?: string,
  ) {
    try {
      const skip = (page - 1) * limit;
      const where: any = { deleted_at: null };

      if (status) where.status = status;
      if (search) {
        where.OR = [
          { first_name: { contains: search, mode: 'insensitive' as any } },
          { last_name: { contains: search, mode: 'insensitive' as any } },
          { email: { contains: search, mode: 'insensitive' as any } },
          { phone_number: { contains: search, mode: 'insensitive' as any } },
          { reason: { contains: search, mode: 'insensitive' as any } },
          { message: { contains: search, mode: 'insensitive' as any } },
        ];
      }

      const [contacts, total] = await Promise.all([
        this.prisma.contact.findMany({
          where,
          skip,
          take: limit,
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            phone_number: true,
            whatsapp_number: true,
            status: true,
            date: true,
            reason: true,
            message: true,
            created_at: true,
            updated_at: true,
          },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.contact.count({ where }),
      ]);

      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        success: true,
        message: 'Contacts retrieved successfully',
        data: {
          contacts,
          pagination: {
            total,
            page,
            limit,
            totalPages,
            hasNextPage,
            hasPreviousPage,
          },
        },
      };
    } catch (error) {
      this.logger.error(`Error fetching contacts: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Failed to fetch contacts',
        error: error.message,
      };
    }
  }

  async findOne(id: string) {
    try {
      const contact = await this.prisma.contact.findUnique({
        where: { id },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          phone_number: true,
          whatsapp_number: true,
          status: true,
          date: true,
          reason: true,
          message: true,
          created_at: true,
          updated_at: true,
        },
      });

      if (!contact) {
        throw new NotFoundException(`Contact with ID ${id} not found`);
      }

      return {
        success: true,
        message: 'Contact retrieved successfully',
        data: contact,
      };
    } catch (error) {
      this.logger.error(`Error fetching contact ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to fetch contact',
        error: error.message,
      };
    }
  }

  async updateStatus(id: string, status: string) {
    try {
      const contact = await this.prisma.contact.findUnique({
        where: { id },
        select: { id: true, status: true },
      });

      if (!contact) {
        throw new NotFoundException(`Contact with ID ${id} not found`);
      }

      const updatedContact = await this.prisma.contact.update({
        where: { id },
        data: { status: status },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          phone_number: true,
          whatsapp_number: true,
          status: true,
          date: true,
          reason: true,
          message: true,
          created_at: true,
          updated_at: true,
        },
      });

      return {
        success: true,
        message: `Contact status updated to approve`,
        data: updatedContact,
      };
    } catch (error) {
      this.logger.error(`Error updating contact status ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to update contact status',
        error: error.message,
      };
    }
  }


  async remove(id: string) {
    try {
      const contact = await this.prisma.contact.findUnique({
        where: { id },
        select: { id: true, deleted_at: true },
      });

      if (!contact) {
        throw new NotFoundException(`Contact with ID ${id} not found`);
      }

      // delete the contact
      await this.prisma.contact.delete({
        where: { id },
      });

      return {
        success: true,
        message: 'Contact deleted successfully',
        data: { id },
      };
    } catch (error) {
      this.logger.error(`Error deleting contact ${id}: ${error.message}`, error.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      return {
        success: false,
        message: 'Failed to delete contact',
        error: error.message,
      };
    }
  }
}
