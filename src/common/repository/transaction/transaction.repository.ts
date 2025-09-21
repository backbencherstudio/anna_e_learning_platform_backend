import { PrismaClient } from '@prisma/client';
import { SeriesService } from 'src/modules/admin/series/series.service';

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
    await prisma.enrollment.update({
      where: { id: paymentTransaction.enrollment_id },
      data: {
          status: 'ACTIVE',
          payment_status: 'completed',
      },
  });

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
