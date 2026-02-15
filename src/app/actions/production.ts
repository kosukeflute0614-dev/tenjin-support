'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Helper to get or create a default organization for MVP
async function getOrganizationId() {
    const org = await prisma.organization.findFirst()
    if (org) return org.id

    const newOrg = await prisma.organization.create({
        data: {
            name: 'Default Theater Company',
            members: {
                create: {
                    name: 'Admin User',
                    role: 'ADMIN'
                }
            }
        }
    })
    return newOrg.id
}

export async function getProductions() {
    const orgId = await getOrganizationId()
    return await prisma.production.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        include: {
            performances: true,
        }
    })
}

export async function createProduction(formData: FormData) {
    const title = formData.get('title') as string
    const orgId = await getOrganizationId()

    if (!title) {
        throw new Error('Title is required')
    }

    await prisma.production.create({
        data: {
            organizationId: orgId,
            title,
        }
    })

    revalidatePath('/productions')
    redirect('/productions')
}

export async function updateProduction(id: string, formData: FormData) {
    const title = formData.get('title') as string

    await prisma.production.update({
        where: { id },
        data: { title }
    })

    revalidatePath(`/productions/${id}`)
    revalidatePath('/productions')
}

export async function deleteProduction(id: string) {
    await prisma.production.delete({
        where: { id }
    })

    revalidatePath('/productions')
}

export async function updateReceptionStatus(id: string, status: 'OPEN' | 'CLOSED') {
    await prisma.production.update({
        where: { id },
        data: { receptionStatus: status }
    })

    revalidatePath(`/productions/${id}/reception`)
    revalidatePath(`/productions/${id}`)
    revalidatePath(`/book/${id}`)
    revalidatePath('/')
}

export async function updateReceptionStart(id: string, startStr: string | null) {
    await prisma.production.update({
        where: { id },
        data: {
            receptionStart: startStr ? new Date(startStr) : null,
            receptionStatus: 'CLOSED'
        }
    })

    revalidatePath(`/productions/${id}/reception`)
    revalidatePath(`/productions/${id}`)
    revalidatePath(`/book/${id}`)
    revalidatePath('/')
}

export async function updateReceptionEnd(id: string, formData: FormData) {
    const endStr = formData.get('receptionEnd') as string
    const mode = formData.get('receptionEndMode') as string
    const minutes = parseInt(formData.get('receptionEndMinutes') as string || '0', 10)

    await prisma.production.update({
        where: { id },
        data: {
            receptionEnd: endStr ? new Date(endStr) : null,
            receptionEndMode: mode || 'MANUAL',
            receptionEndMinutes: minutes || 0,
            receptionStatus: 'CLOSED'
        }
    })

    revalidatePath(`/productions/${id}/reception`)
    revalidatePath(`/productions/${id}`)
    revalidatePath(`/book/${id}`)
    revalidatePath('/')
}

export async function updateReceptionSchedule(id: string, formData: FormData) {
    const startStr = formData.get('receptionStart') as string
    const endStr = formData.get('receptionEnd') as string
    const mode = formData.get('receptionEndMode') as string
    const minutes = parseInt(formData.get('receptionEndMinutes') as string || '0', 10)

    await prisma.production.update({
        where: { id },
        data: {
            receptionStart: startStr ? new Date(startStr) : null,
            receptionEnd: endStr ? new Date(endStr) : null,
            receptionEndMode: mode || 'MANUAL',
            receptionEndMinutes: minutes || 0
        }
    })

    revalidatePath(`/productions/${id}/reception`)
    revalidatePath(`/productions/${id}`)
    revalidatePath(`/book/${id}`)
    revalidatePath('/')
}
