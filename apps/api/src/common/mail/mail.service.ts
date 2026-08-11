import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

interface SendMailInput {
  to: string;
  subject: string;
  text: string;
}

/**
 * Thin SMTP wrapper, provider-agnostic (docs/09 - no paid third-party API in the app core).
 * Silently no-ops without SMTP_HOST, mirroring the VAPID push pattern (notifications.service.ts):
 * safe local-dev default, boot fails loudly in production instead (env.schema.ts).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    this.from = this.config.getOrThrow('SMTP_FROM');
    if (!host) {
      this.transporter = null;
      return;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port: this.config.getOrThrow('SMTP_PORT'),
      secure: this.config.getOrThrow('SMTP_PORT') === 465,
      auth: {
        user: this.config.getOrThrow('SMTP_USER'),
        pass: this.config.getOrThrow('SMTP_PASS'),
      },
    });
  }

  async send(input: SendMailInput): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`SMTP not configured, dropping email (${input.subject})`);
      return;
    }
    try {
      await this.transporter.sendMail({ from: this.from, to: input.to, subject: input.subject, text: input.text });
    } catch (error) {
      // Never blocks the caller's flow (e.g. password reset stays no-enumeration even if delivery fails).
      this.logger.warn(`Email delivery failed: ${error}`);
    }
  }
}
