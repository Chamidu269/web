import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Auto-seed admin if empty (Safety Net)
    const { count } = await supabase.from('admins').select('*', { count: 'exact', head: true });

    if (count === 0) {
      const defaultHash = await bcrypt.hash('admin123', 10);
      await supabase.from('admins').insert([
        {
          username: 'admin',
          password_hash: defaultHash,
          email: 'admin@paysmart.lk',
        }
      ]);
    }

    // 2. Fetch admin account
    const { data: admin, error } = await supabase
      .from('admins')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !admin) {
      return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 401 });
    }

    // 3. Compare passwords
    const isValid = await bcrypt.compare(password, admin.password_hash);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 401 });
    }

    // 4. Generate admin JWT
    const secret = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET || 'fallback-admin-jwt-secret-key-at-least-32-chars');
    const token = await new SignJWT({ 
      role: 'admin', 
      admin_id: admin.id,
      username: admin.username 
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1d')
      .sign(secret);

    // 5. Create response and set cookie
    const response = NextResponse.json({ success: true });
    response.cookies.set('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 1 day
      path: '/',
    });

    return response;
  } catch (err: any) {
    console.error('Admin login API error:', err);
    return NextResponse.json({ error: 'Internal server error: ' + err.message }, { status: 500 });
  }
}
