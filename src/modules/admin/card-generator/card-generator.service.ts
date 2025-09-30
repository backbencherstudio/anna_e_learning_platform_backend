import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateCardGeneratorDto } from './dto/create-card-generator.dto';
import { UpdateCardGeneratorDto } from './dto/update-card-generator.dto';
import { CardGeneratorResponse } from './interfaces/card-generator-response.interface';
import { CardGenerator } from '@prisma/client';
import { SojebStorage } from '../../../common/lib/Disk/SojebStorage';
import appConfig from '../../../config/app.config';
import { StringHelper } from '../../../common/helper/string.helper';
import { MailService } from '../../../mail/mail.service';

@Injectable()
export class CardGeneratorService {
    private readonly logger = new Logger(CardGeneratorService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly mailService: MailService,
    ) { }

    /**
     * Create a new card generator with optional image upload
     */
    async create(createCardGeneratorDto: CreateCardGeneratorDto, file?: Express.Multer.File): Promise<CardGeneratorResponse<CardGenerator>> {
        try {
            this.logger.log('Creating new card generator');
            // Validate student exists
            const student = await this.prisma.user.findUnique({
                where: { id: createCardGeneratorDto.student_id }
            });

            if (!student) {
                throw new BadRequestException('Student not found');
            }

            // Handle image upload if provided
            let imageUrl: string | undefined;
            if (file) {
                const fileName = StringHelper.generateRandomFileName(file.originalname);
                await SojebStorage.put(appConfig().storageUrl.card_generator_file + fileName, file.buffer);
                imageUrl = fileName;
                this.logger.log(`Uploaded card generator image: ${fileName}`);
            } else {
                throw new BadRequestException('Image is required');
            }

            const cardGenerator = await this.prisma.cardGenerator.create({
                data: {
                    title: createCardGeneratorDto.title,
                    message: createCardGeneratorDto.message,
                    image: imageUrl,
                    recipient_name: createCardGeneratorDto.recipient_name,
                    recipient_email: createCardGeneratorDto.recipient_email,
                    sender_name: createCardGeneratorDto.sender_name,
                    student_id: createCardGeneratorDto.student_id,
                },
                include: {
                    student: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
            });

            // Add image URL to response
            if (cardGenerator.image) {
                cardGenerator['image_url'] = SojebStorage.url(appConfig().storageUrl.card_generator_file + cardGenerator.image);
            }

            // Send email to recipient if email is provided
            await this.mailService.sendCardGeneratorEmail({
                cardGenerator: cardGenerator,
                recipientEmail: cardGenerator.recipient_email || student.email,
                recipientName: cardGenerator.recipient_name || student.name,
            });
            this.logger.log(`Card generator email sent to ${cardGenerator.recipient_email || student.email}`);



            return {
                success: true,
                message: 'Card generator created successfully',
                data: cardGenerator,
            };
        } catch (error) {
            this.logger.error(`Error creating card generator: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to create card generator',
                error: error.message,
            };
        }
    }

    /**
     * Get all card generators with pagination and filtering
     */
    async findAll(
        page: number = 1,
        limit: number = 10,
        search?: string,
        student_id?: string,
    ): Promise<CardGeneratorResponse<{ cardGenerators: any[]; pagination: any }>> {
        try {
            this.logger.log('Fetching all card generators');

            const skip = (page - 1) * limit;
            const where: any = {
                deleted_at: null,
            };

            // Add search filter
            if (search) {
                where.OR = [
                    { title: { contains: search, mode: 'insensitive' as any } },
                    { message: { contains: search, mode: 'insensitive' as any } },
                    { recipient_name: { contains: search, mode: 'insensitive' as any } },
                    { sender_name: { contains: search, mode: 'insensitive' as any } },
                ];
            }

            // Add student filter
            if (student_id) {
                where.student_id = student_id;
            }

            const [cardGenerators, total] = await Promise.all([
                this.prisma.cardGenerator.findMany({
                    where,
                    skip,
                    take: limit,
                    include: {
                        student: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },
                    },
                    orderBy: { created_at: 'desc' },
                }),
                this.prisma.cardGenerator.count({ where }),
            ]);

            // Add image URLs to all card generators
            for (const cardGenerator of cardGenerators) {
                if (cardGenerator.image) {
                    cardGenerator['image_url'] = SojebStorage.url(appConfig().storageUrl.card_generator_file + cardGenerator.image);
                }
            }

            // Calculate pagination values
            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPreviousPage = page > 1;

            return {
                success: true,
                message: 'Card generators retrieved successfully',
                data: {
                    cardGenerators,
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
            this.logger.error(`Error fetching card generators: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to fetch card generators',
                error: error.message,
            };
        }
    }

    /**
     * Get a single card generator by ID
     */
    async findOne(id: string): Promise<CardGeneratorResponse<CardGenerator>> {
        try {
            this.logger.log(`Fetching card generator with ID: ${id}`);

            const cardGenerator = await this.prisma.cardGenerator.findFirst({
                where: {
                    id,
                    deleted_at: null,
                },
                include: {
                    student: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
            });

            if (!cardGenerator) {
                throw new NotFoundException('Card generator not found');
            }

            // Add image URL to response
            if (cardGenerator.image) {
                cardGenerator['image_url'] = SojebStorage.url(appConfig().storageUrl.card_generator_file + cardGenerator.image);
            }

            return {
                success: true,
                message: 'Card generator retrieved successfully',
                data: cardGenerator,
            };
        } catch (error) {
            this.logger.error(`Error fetching card generator: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to fetch card generator',
                error: error.message,
            };
        }
    }

    /**
     * Update a card generator with optional image upload
     */
    async update(id: string, updateCardGeneratorDto: UpdateCardGeneratorDto, file?: Express.Multer.File): Promise<CardGeneratorResponse<CardGenerator>> {
        try {
            this.logger.log(`Updating card generator with ID: ${id}`);

            // Check if card generator exists
            const existingCardGenerator = await this.prisma.cardGenerator.findFirst({
                where: {
                    id,
                    deleted_at: null,
                },
            });

            if (!existingCardGenerator) {
                throw new NotFoundException('Card generator not found');
            }

            // Validate student if provided
            if (updateCardGeneratorDto.student_id) {
                const student = await this.prisma.user.findUnique({
                    where: { id: updateCardGeneratorDto.student_id }
                });
                if (!student) {
                    throw new BadRequestException('Student not found');
                }
            }

            // Handle image upload if provided
            let imageUrl = updateCardGeneratorDto.image;
            if (file) {
                const fileName = StringHelper.generateRandomFileName(file.originalname);
                await SojebStorage.put(appConfig().storageUrl.card_generator_file + fileName, file.buffer);
                imageUrl = fileName;
                this.logger.log(`Uploaded updated card generator image: ${fileName}`);
            }

            const cardGenerator = await this.prisma.cardGenerator.update({
                where: { id },
                data: {
                    ...updateCardGeneratorDto,
                    image: imageUrl,
                    updated_at: new Date(),
                },
                include: {
                    student: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
            });

            // Add image URL to response
            if (cardGenerator.image) {
                cardGenerator['image_url'] = SojebStorage.url(appConfig().storageUrl.card_generator_file + cardGenerator.image);
            }

            return {
                success: true,
                message: 'Card generator updated successfully',
                data: cardGenerator,
            };
        } catch (error) {
            this.logger.error(`Error updating card generator: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to update card generator',
                error: error.message,
            };
        }
    }

    /**
     * Soft delete a card generator
     */
    async remove(id: string): Promise<CardGeneratorResponse<null>> {
        try {
            this.logger.log(`Deleting card generator with ID: ${id}`);

            // Check if card generator exists
            const existingCardGenerator = await this.prisma.cardGenerator.findFirst({
                where: {
                    id,
                    deleted_at: null,
                },
            });

            if (!existingCardGenerator) {
                throw new NotFoundException('Card generator not found');
            }

            await this.prisma.cardGenerator.update({
                where: { id },
                data: {
                    deleted_at: new Date(),
                },
            });

            return {
                success: true,
                message: 'Card generator deleted successfully',
                data: null,
            };
        } catch (error) {
            this.logger.error(`Error deleting card generator: ${error.message}`, error.stack);
            return {
                success: false,
                message: 'Failed to delete card generator',
                error: error.message,
            };
        }
    }

}
