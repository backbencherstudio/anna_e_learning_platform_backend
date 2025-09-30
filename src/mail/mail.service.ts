import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { MailerService } from '@nestjs-modules/mailer';
import appConfig from '../config/app.config';

@Injectable()
export class MailService {
  constructor(
    @InjectQueue('mail-queue') private queue: Queue,
    private mailerService: MailerService,
  ) { }

  async sendMemberInvitation({ user, member, url }) {
    try {
      const from = `${process.env.APP_NAME} <${appConfig().mail.from}>`;
      const subject = `${user.fname} is inviting you to ${appConfig().app.name}`;

      // add to queue
      await this.queue.add('sendMemberInvitation', {
        to: member.email,
        from: from,
        subject: subject,
        template: 'member-invitation',
        context: {
          user: user,
          member: member,
          url: url,
        },
      });
    } catch (error) {
      console.log(error);
    }
  }

  // send otp code for email verification
  async sendOtpCodeToEmail({ name, email, otp }) {
    try {
      const from = `${process.env.APP_NAME} <${appConfig().mail.from}>`;
      const subject = 'Email Verification';

      // add to queue
      await this.queue.add('sendOtpCodeToEmail', {
        to: email,
        from: from,
        subject: subject,
        template: 'email-verification',
        context: {
          name: name,
          otp: otp,
        },
      });
    } catch (error) {
      console.log(error);
    }
  }

  async sendVerificationLink(params: {
    email: string;
    name: string;
    token: string;
    type: string;
  }) {
    try {
      const verificationLink = `${appConfig().app.client_app_url}/verify-email?token=${params.token}&email=${params.email}&type=${params.type}`;

      // add to queue
      await this.queue.add('sendVerificationLink', {
        to: params.email,
        subject: 'Verify Your Email',
        template: './verification-link',
        context: {
          name: params.name,
          verificationLink,
        },
      });
    } catch (error) {
      console.log(error);
    }
  }

  async sendCardGeneratorEmail({ cardGenerator, recipientEmail, recipientName }) {
    try {
      const from = `${process.env.APP_NAME} <${appConfig().mail.from}>`;
      const subject = `🎉 You received a card: ${cardGenerator.title}`;

      // add to queue
      await this.queue.add('sendCardGeneratorEmail', {
        to: recipientEmail,
        from: from,
        subject: subject,
        template: 'card-generator',
        context: {
          cardGenerator: cardGenerator,
          recipientName: recipientName,
          cardImageUrl: cardGenerator.image_url,
        },
      });
    } catch (error) {
      console.log(error);
    }
  }

  async sendStudentNotificationEmail(params: {
    to: string;
    recipientName?: string;
    subject?: string;
    message: string;
  }) {
    try {
      const from = `${process.env.APP_NAME} <${appConfig().mail.from}>`;
      const subject = params.subject || 'Notification from ' + (appConfig().app.name || 'our platform');

      await this.queue.add('sendStudentNotificationEmail', {
        to: params.to,
        from,
        subject,
        template: 'student-notification',
        context: {
          name: params.recipientName || '',
          message: params.message,
          appName: appConfig().app.name,
        },
      });
    } catch (error) {
      console.log(error);
    }
  }
}
