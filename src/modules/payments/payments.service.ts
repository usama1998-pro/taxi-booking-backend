import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

type PayPalAccessToken = {
  accessToken: string;
  expiresAtMs: number;
};

type PayPalOrderResponse = {
  id?: string;
  status?: string;
};

@Injectable()
export class PaymentsService {
  private paypalAccessTokenCache: PayPalAccessToken | null = null;

  private paypalApiBase(): string {
    const mode = process.env.PAYPAL_MODE?.trim().toLowerCase();
    return mode === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  private paypalCredentials(): { clientId: string; clientSecret: string } {
    const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        'PayPal is not configured on the server (PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET).',
      );
    }
    return { clientId, clientSecret };
  }

  private async getPayPalAccessToken(): Promise<string> {
    const now = Date.now();
    if (
      this.paypalAccessTokenCache &&
      this.paypalAccessTokenCache.expiresAtMs > now + 60_000
    ) {
      return this.paypalAccessTokenCache.accessToken;
    }

    const { clientId, clientSecret } = this.paypalCredentials();
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch(`${this.paypalApiBase()}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    const json = (await res.json().catch(() => null)) as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
    } | null;

    if (!res.ok || !json?.access_token) {
      throw new ServiceUnavailableException(
        json?.error_description ?? 'Could not authenticate with PayPal.',
      );
    }

    const expiresInSec = typeof json.expires_in === 'number' ? json.expires_in : 3600;
    this.paypalAccessTokenCache = {
      accessToken: json.access_token,
      expiresAtMs: now + expiresInSec * 1000,
    };
    return json.access_token;
  }

  private async paypalRequest<T>(
    path: string,
    init: RequestInit,
  ): Promise<T> {
    const accessToken = await this.getPayPalAccessToken();
    const res = await fetch(`${this.paypalApiBase()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    const json = (await res.json().catch(() => null)) as T & {
      message?: string;
      details?: Array<{ description?: string }>;
    };

    if (!res.ok) {
      const detail = json?.details?.[0]?.description;
      throw new BadRequestException(
        detail ?? json?.message ?? 'PayPal request failed.',
      );
    }

    return json;
  }

  async createPayPalOrder(
    amountEur: number,
    description?: string,
    returnUrl?: string,
    cancelUrl?: string,
  ): Promise<{ orderId: string }> {
    const amountCents = Math.round(amountEur * 100);
    if (amountCents < 50) {
      throw new BadRequestException('Payment amount is too small.');
    }

    const trimmedReturn = returnUrl?.trim();
    const trimmedCancel = cancelUrl?.trim();
    const paypalLocale = process.env.PAYPAL_LOCALE?.trim() || 'en-US';
    const applicationContext =
      trimmedReturn && trimmedCancel
        ? {
            return_url: trimmedReturn,
            cancel_url: trimmedCancel,
            user_action: 'PAY_NOW',
            shipping_preference: 'NO_SHIPPING',
            locale: paypalLocale,
          }
        : undefined;

    const order = await this.paypalRequest<PayPalOrderResponse>('/v2/checkout/orders', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'CAPTURE',
        application_context: applicationContext,
        purchase_units: [
          {
            description: description?.trim() || undefined,
            amount: {
              currency_code: 'EUR',
              value: amountEur.toFixed(2),
            },
          },
        ],
      }),
    });

    if (!order.id) {
      throw new ServiceUnavailableException(
        'PayPal did not return an order id for this payment.',
      );
    }

    return { orderId: order.id };
  }

  async capturePayPalOrder(orderId: string): Promise<{ status: string }> {
    const trimmedId = orderId.trim();
    if (!trimmedId) {
      throw new BadRequestException('PayPal order id is required.');
    }

    const capture = await this.paypalRequest<PayPalOrderResponse>(
      `/v2/checkout/orders/${encodeURIComponent(trimmedId)}/capture`,
      { method: 'POST' },
    );

    const status = capture.status ?? '';
    if (status !== 'COMPLETED') {
      throw new BadRequestException('PayPal payment was not completed.');
    }

    return { status };
  }

  private stripeSecretKey(): string {
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    if (!key) {
      throw new ServiceUnavailableException(
        'Card payments are not configured on the server (STRIPE_SECRET_KEY).',
      );
    }
    return key;
  }

  async createStripePaymentIntent(amountEur: number): Promise<{ clientSecret: string }> {
    const amountCents = Math.round(amountEur * 100);
    if (amountCents < 50) {
      throw new BadRequestException('Payment amount is too small.');
    }

    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(this.stripeSecretKey());

    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
    });

    if (!intent.client_secret) {
      throw new ServiceUnavailableException(
        'Stripe did not return a client secret for this payment.',
      );
    }

    return { clientSecret: intent.client_secret };
  }
}
