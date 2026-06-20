import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'dummy_key', {
  apiVersion: '2024-04-10' as any,
});

export async function POST(request: Request) {
  try {
    // 1. Authenticate user
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { amount } = await request.json();
    const topUpAmount = parseFloat(amount);

    if (isNaN(topUpAmount) || topUpAmount < 100) {
      return NextResponse.json({ error: 'Minimum top up value is LKR 100' }, { status: 400 });
    }

    // Determine host origin for redirect urls
    const origin = request.headers.get('origin') || 'http://localhost:3000';

    // 2. Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'lkr',
            product_data: {
              name: 'PaySmart Wallet Recharge',
              description: 'Instant transit credit top-up',
            },
            unit_amount: Math.round(topUpAmount * 100), // Stripe expects cents/cents value
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${origin}/dashboard?success=true`,
      cancel_url: `${origin}/recharge?cancelled=true`,
      metadata: {
        passenger_id: user.id,
        amount: topUpAmount.toString(),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('Stripe session creation error:', err);
    return NextResponse.json({ error: 'Failed to initiate secure checkout: ' + err.message }, { status: 500 });
  }
}
