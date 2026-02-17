'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const ACTIVE_PRODUCTION_COOKIE_NAME = 'active_production_id';

export async function getActiveProductionId() {
    const cookieStore = await cookies();
    return cookieStore.get(ACTIVE_PRODUCTION_COOKIE_NAME)?.value;
}

export async function setActiveProductionId(id: string) {
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_PRODUCTION_COOKIE_NAME, id, {
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
    });
}

export async function clearActiveProductionId() {
    const cookieStore = await cookies();
    cookieStore.delete(ACTIVE_PRODUCTION_COOKIE_NAME);
}

export async function switchProduction(id: string) {
    await setActiveProductionId(id);
    redirect('/');
}
