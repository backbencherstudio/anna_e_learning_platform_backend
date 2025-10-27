import { PrismaClient } from '@prisma/client';
import { SeriesService } from 'src/modules/admin/series/series.service';
import { SeriesService as StudentSeriesService } from 'src/modules/student/series/series.service.refactored';

const prisma = new PrismaClient();

export class TransactionRepository {
  /**
   * Create transaction
   * @returns
   */
  static async createTransaction({
    enrollment_id,
    amount,
    currency,
    reference_number,
    status = 'pending',
  }: {
    enrollment_id: string;
    amount?: number;
    currency?: string;
    reference_number?: string;
    status?: string;
  }) {
    const data = {};
    if (enrollment_id) {
      data['enrollment_id'] = enrollment_id;
    }
    if (amount) {
      data['amount'] = Number(amount);
    }
    if (currency) {
      data['currency'] = currency;
    }
    if (reference_number) {
      data['reference_number'] = reference_number;
    }
    if (status) {
      data['status'] = status;
    }
    return await prisma.paymentTransaction.create({
      data: {
        ...data,
      },
    });
  }

  /**
   * Update transaction
   * @returns
   */
  /**
   * Recalculate and update available_site for all series
   * Formula: available_site = total_site - enrollment_count
   */
  static async recalculateAllAvailableSites() {
    try {
      console.log('Starting recalculation of available seats for all series...');

      // Get all series
      const allSeries = await prisma.series.findMany({
        where: { deleted_at: null },
        select: { id: true, title: true, total_site: true }
      });

      const results = [];

      for (const series of allSeries) {
        const result = await this.recalculateAvailableSites(series.id);
        if (result) {
          results.push(result);
        }
      }

      console.log(`Completed recalculation for ${results.length} series`);
      return results;
    } catch (error) {
      console.error('Error recalculating available sites for all series:', error);
      throw error;
    }
  }

  /**
   * Recalculate and update available_site for a series
   * Formula: available_site = total_site - enrollment_count
   */
  static async recalculateAvailableSites(seriesId: string) {
    try {
      // Get total_site from series
      const series = await prisma.series.findUnique({
        where: { id: seriesId },
        select: { total_site: true, title: true }
      });

      if (!series) {
        console.error(`Series not found: ${seriesId}`);
        return;
      }

      // Count active enrollments for this series
      const enrollmentCount = await prisma.enrollment.count({
        where: {
          series_id: seriesId,
          status: { in: ['ACTIVE', 'COMPLETED'] },
          payment_status: 'completed',
          deleted_at: null
        }
      });

      // Calculate available_site = total_site - enrollment_count
      const availableSite = (series.total_site || 0) - enrollmentCount;

      // Update the series with calculated available_site
      await prisma.series.update({
        where: { id: seriesId },
        data: { available_site: availableSite },
      });

      console.log(`Recalculated available seats for "${series.title}": ${availableSite} (Total: ${series.total_site}, Enrolled: ${enrollmentCount})`);

      return {
        seriesId,
        totalSite: series.total_site,
        enrollmentCount,
        availableSite
      };
    } catch (error) {
      console.error(`Error recalculating available sites for series ${seriesId}:`, error);
      throw error;
    }
  }

  static async updateTransaction({
    reference_number,
    status = 'pending',
    paid_amount,
    paid_currency,
    raw_status,
  }: {
    reference_number: string;
    status: string;
    paid_amount?: number;
    paid_currency?: string;
    raw_status?: string;
  }) {
    const data = {};
    const order_data = {};
    if (status) {
      data['status'] = status;
      order_data['payment_status'] = status;
    }
    if (paid_amount) {
      data['paid_amount'] = Number(paid_amount);
      order_data['paid_amount'] = Number(paid_amount);
    }
    if (paid_currency) {
      data['paid_currency'] = paid_currency;
      order_data['paid_currency'] = paid_currency;
    }
    if (raw_status) {
      data['raw_status'] = raw_status;
      order_data['payment_raw_status'] = raw_status;
    }

    const paymentTransaction = await prisma.paymentTransaction.findFirst({
      where: {
        reference_number: reference_number,
      },
    });

    // Update enrollment status to active
    const updatedEnrollment = await prisma.enrollment.update({
      where: { id: paymentTransaction.enrollment_id },
      data: {
        status: 'ACTIVE',
        payment_status: 'completed',
        paid_amount: paid_amount,
        paid_currency: paid_currency,
        payment_raw_status: raw_status,
      },
    });


    // Import and use SeriesService properly
    const { SeriesService } = await import('../../../modules/student/series/series.service');
    const seriesService = new SeriesService(prisma as any);
    await seriesService.unlockFirstLessonForUser(updatedEnrollment.user_id, updatedEnrollment.series_id);

    // Update user type to student
    await prisma.user.update({
      where: { id: updatedEnrollment.user_id },
      data: { type: 'student' },
    });

    // Recalculate available seats for the series
    if (updatedEnrollment && updatedEnrollment.series_id) {
      await this.recalculateAvailableSites(updatedEnrollment.series_id);
    }

    return await prisma.paymentTransaction.updateMany({
      where: {
        reference_number: reference_number,
      },
      data: {
        ...data,
      },
    });
  }
}
