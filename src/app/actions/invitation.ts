'use server'

export async function validateInvitationCode(code: string): Promise<boolean> {
    const validCode = process.env.INVITATION_CODE
    if (!validCode) {
        // 招待コードが未設定の場合は誰でも登録可能（将来的に制限を外す場合）
        return true
    }
    return code.trim() === validCode
}
